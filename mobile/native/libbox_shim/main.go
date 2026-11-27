// Package main builds a minimal C-shared shim around sing-box libbox v1.14.4.
// One shim, two config modes: the no-TUN ping path (libbox_start + urltest /
// urltest_take with generate_204) and the TUN tunnel path
// (libbox_start_with_tun with a platform-owned fd + libbox_traffic counters).
// Both share setup, config validation, stop and generic error discipline.
//
// This is deliberately NOT gomobile: gomobile emits a JNI .aar / ObjC
// .xcframework, which dart:ffi cannot bind. Here we export a flat C ABI and
// let ffigen generate the Dart declarations from the generated header.
//
// NOTE: the real libbox API is CommandClient.URLTest(outboundTag string) error.
// It returns no RTT. RTT arrives asynchronously through
// CommandClientHandler.WriteGroups -> OutboundGroupItem.URLTestDelay/Time.
// There is no sing-box-provided urltest C symbol and no ICMP here.
package main

/*
#include <stdint.h>
#include <stdlib.h>
*/
import "C"

import (
	"encoding/json"
	"errors"
	"sync"
	"time"
	"unsafe"

	"github.com/sagernet/sing-box/experimental/libbox"
)

var errUnsupported = errors.New("not supported by the ping-only libbox shim")

// noopPlatform is an intentionally inert PlatformInterface. Phase 19 only
// needs outbound URLTest against a no-TUN config, so no platform tunnel,
// notification, DNS or shell integration is wired.
type noopPlatform struct{}

func (noopPlatform) LocalDNSTransport() libbox.LocalDNSTransport { return nil }
func (noopPlatform) UsePlatformAutoDetectInterfaceControl() bool { return false }
func (noopPlatform) AutoDetectInterfaceControl(int32) error      { return nil }
func (noopPlatform) OpenTun(libbox.TunOptions) (int32, error) {
	return 0, errUnsupported
}
func (noopPlatform) FindConnectionOwner(int32, string, int32, string, int32) (*libbox.ConnectionOwner, error) {
	return nil, errUnsupported
}
func (noopPlatform) StartDefaultInterfaceMonitor(libbox.InterfaceUpdateListener) error {
	return nil
}
func (noopPlatform) CloseDefaultInterfaceMonitor(libbox.InterfaceUpdateListener) error {
	return nil
}
func (noopPlatform) GetInterfaces() (libbox.NetworkInterfaceIterator, error) {
	return nil, errUnsupported
}
func (noopPlatform) UnderNetworkExtension() bool { return false }
func (noopPlatform) IncludeAllNetworks() bool    { return false }
func (noopPlatform) ReadWIFIState() *libbox.WIFIState {
	return nil
}
func (noopPlatform) ClearDNSCache()                              {}
func (noopPlatform) SendNotification(*libbox.Notification) error { return nil }
func (noopPlatform) CancelNotification(string, int32) error      { return nil }
func (noopPlatform) StartNeighborMonitor(libbox.NeighborUpdateListener) error {
	return nil
}
func (noopPlatform) CloseNeighborMonitor(libbox.NeighborUpdateListener) error {
	return nil
}
func (noopPlatform) RegisterMyInterface(string) {}
func (noopPlatform) UsePlatformShell() bool     { return false }
func (noopPlatform) CheckPlatformShell() error  { return nil }
func (noopPlatform) OpenShellSession(*libbox.PlatformUser, string, libbox.StringIterator, string, int32, int32) (libbox.ShellSession, error) {
	return nil, errUnsupported
}
func (noopPlatform) LookupUser(string) (*libbox.PlatformUser, error) {
	return nil, errUnsupported
}
func (noopPlatform) LookupSFTPServer() (string, error) { return "", errUnsupported }
func (noopPlatform) ReadSystemSSHHostKey() (string, error) {
	return "", errUnsupported
}
func (noopPlatform) TailscaleHostname() string { return "" }
func (noopPlatform) UsePlatformBridge() bool   { return false }
func (noopPlatform) CreateBridge(*libbox.BridgeOptions) (libbox.BridgeSession, error) {
	return nil, errUnsupported
}

// tunPlatform is the TUN-mode PlatformInterface. The fd is owned by the native
// platform (Android VpnService / iOS tunnel flow); libbox queries the interface
// name from it and dups it internally, so the original fd is never closed here.
// All other platform callbacks stay inert, inherited from noopPlatform.
type tunPlatform struct {
	noopPlatform
	fd int32
}

func (p *tunPlatform) OpenTun(libbox.TunOptions) (int32, error) {
	return p.fd, nil
}

// noopServerHandler satisfies libbox.CommandServerHandler without exposing
// any system-proxy or crash surface to the ping-only shim.
type noopServerHandler struct{}

func (noopServerHandler) ServiceStop() error   { return nil }
func (noopServerHandler) ServiceReload() error { return nil }
func (noopServerHandler) GetSystemProxyStatus() (*libbox.SystemProxyStatus, error) {
	return nil, nil
}
func (noopServerHandler) SetSystemProxyEnabled(bool) error { return nil }
func (noopServerHandler) TriggerNativeCrash() error        { return nil }
func (noopServerHandler) WriteDebugMessage(string)         {}
func (noopServerHandler) ConnectSSHAgent() (int32, error)  { return 0, errUnsupported }

// urltestRecord is the last observed async group item for one outbound tag.
// URLTestTime is Unix seconds and URLTestDelay is milliseconds; (0,0) means
// "no history" — including the failed case, where sing-box deletes history.
type urltestRecord struct {
	delayMs int32
	timeS   int64
	seq     uint64
}

// urltestHandler captures WriteGroups results and wakes in-flight urltest
// callers when a tag's group item is refreshed.
type urltestHandler struct {
	mu       sync.Mutex
	records  map[string]urltestRecord
	waiters  map[string]map[chan struct{}]struct{}
	groupFor map[string]string // urltest group member tag -> group tag
	seq      uint64

	// Traffic counters captured from WriteStatus (CommandStatus=1). Stored
	// under the same mutex as the group records; never fabricated or logged.
	trafficAvailable bool
	downTotal        int64
	upTotal          int64
}

func newURLTestHandler() *urltestHandler {
	return &urltestHandler{
		records:  make(map[string]urltestRecord),
		waiters:  make(map[string]map[chan struct{}]struct{}),
		groupFor: make(map[string]string),
	}
}

// setGroups records which outbound tags belong to a urltest group. The Dart
// side configures the group's fixed generate_204 probe URL (D-06); triggering
// URLTest on a member tag is redirected to its group so that URL is used.
func (h *urltestHandler) setGroups(groups map[string]string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.groupFor = groups
}

func (h *urltestHandler) signal(tag string) {
	for ch := range h.waiters[tag] {
		close(ch)
	}
	delete(h.waiters, tag)
}

func (h *urltestHandler) WriteGroups(iterator libbox.OutboundGroupIterator) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for iterator.HasNext() {
		group := iterator.Next()
		if group == nil {
			break
		}
		items := group.GetItems()
		for items.HasNext() {
			item := items.Next()
			if item == nil {
				break
			}
			h.seq++
			record := urltestRecord{
				delayMs: item.URLTestDelay,
				timeS:   item.URLTestTime,
				seq:     h.seq,
			}
			h.records[item.Tag] = record
			h.signal(item.Tag)
			if group, ok := h.groupFor[item.Tag]; ok {
				// Mirror the member sample under the group tag so a caller that
				// triggered URLTest on the group can read it back as well.
				h.records[group] = record
				h.signal(group)
			}
		}
	}
}

func (h *urltestHandler) Connected()                   {}
func (h *urltestHandler) Disconnected(string)          {}
func (h *urltestHandler) SetDefaultLogLevel(int32)     {}
func (h *urltestHandler) ClearLogs()                   {}
func (h *urltestHandler) WriteLogs(libbox.LogIterator) {}
func (h *urltestHandler) WriteStatus(status *libbox.StatusMessage) {
	if status == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.trafficAvailable = status.TrafficAvailable
	h.downTotal = status.DownlinkTotal
	h.upTotal = status.UplinkTotal
}
func (h *urltestHandler) WriteOutbounds(libbox.OutboundGroupItemIterator)   {}
func (h *urltestHandler) InitializeClashMode(libbox.StringIterator, string) {}
func (h *urltestHandler) UpdateClashMode(string)                            {}
func (h *urltestHandler) WriteConnectionEvents(*libbox.ConnectionEvents)    {}

// Service state is process-global: one no-TUN sing-box instance per app.
var (
	serviceMu     sync.Mutex
	commandServer *libbox.CommandServer
	commandClient *libbox.CommandClient
	activeHandler *urltestHandler
)

// urltestResult is the JSON contract read by urltest_take on the Dart side.
type urltestResult struct {
	Online bool `json:"online"`
	RttMs  int  `json:"rttMs"`
}

// trafficResult is the JSON contract read by libbox_traffic on the Dart side.
// int64 counters are encoded losslessly; "available" reports whether libbox
// supplied live counters for this session. No value is fabricated here.
type trafficResult struct {
	Down      int64 `json:"down"`
	Up        int64 `json:"up"`
	Available bool  `json:"available"`
}

func cEmptyString() *C.char {
	return C.CString("")
}

// cErrorMessage deliberately returns a generic message: sing-box errors can
// echo configuration fragments, which must never reach logs or the UI.
func cErrorMessage(generic string) *C.char {
	return C.CString(generic)
}

// checkConfigErrorText is the Go-side view of libbox_check_config's returned C
// string. cgo cannot be imported from _test.go files, so unit tests use this
// seam to assert that only the fixed generic message crosses the FFI boundary.
func checkConfigErrorText(config string) string {
	ptr := C.CString(config)
	defer C.free(unsafe.Pointer(ptr))
	result := libbox_check_config(ptr)
	defer libbox_free_string(result)
	return C.GoString(result)
}

// urltestGroups maps each urltest group member tag to the group tag. The group
// carries the fixed generate_204 probe URL from the Dart-generated config.
func urltestGroups(configJSON string) map[string]string {
	groups := make(map[string]string)
	var parsed struct {
		Outbounds []struct {
			Type      string   `json:"type"`
			Tag       string   `json:"tag"`
			Outbounds []string `json:"outbounds"`
		} `json:"outbounds"`
	}
	if err := json.Unmarshal([]byte(configJSON), &parsed); err != nil {
		return groups
	}
	for _, out := range parsed.Outbounds {
		if out.Type != "urltest" || out.Tag == "" {
			continue
		}
		for _, member := range out.Outbounds {
			groups[member] = out.Tag
		}
	}
	return groups
}

//export libbox_setup
func libbox_setup(basePath *C.char, workingPath *C.char, tempPath *C.char) *C.char {
	err := libbox.Setup(&libbox.SetupOptions{
		BasePath:    C.GoString(basePath),
		WorkingPath: C.GoString(workingPath),
		TempPath:    C.GoString(tempPath),
		AppVersion:  "3set-mobile",
	})
	if err != nil {
		return cErrorMessage("libbox setup failed")
	}
	return cEmptyString()
}

//export libbox_check_config
func libbox_check_config(configJSON *C.char) *C.char {
	if err := libbox.CheckConfig(C.GoString(configJSON)); err != nil {
		return cErrorMessage("invalid configuration")
	}
	return cEmptyString()
}

//export libbox_start
func libbox_start(configJSON *C.char) *C.char {
	config := C.GoString(configJSON)
	if err := libbox.CheckConfig(config); err != nil {
		return cErrorMessage("invalid configuration")
	}
	groups := urltestGroups(config)

	serviceMu.Lock()
	defer serviceMu.Unlock()

	if commandServer != nil {
		if activeHandler != nil {
			activeHandler.setGroups(groups)
		}
		if err := commandServer.StartOrReloadService(config, &libbox.OverrideOptions{}); err != nil {
			return cErrorMessage("failed to start sing-box service")
		}
		return cEmptyString()
	}

	server, err := libbox.NewCommandServer(noopServerHandler{}, noopPlatform{})
	if err != nil {
		return cErrorMessage("failed to create command server")
	}
	if err := server.Start(); err != nil {
		return cErrorMessage("failed to start command server")
	}
	if err := server.StartOrReloadService(config, &libbox.OverrideOptions{}); err != nil {
		server.Close()
		return cErrorMessage("failed to start sing-box service")
	}

	handler := newURLTestHandler()
	handler.setGroups(groups)
	options := &libbox.CommandClientOptions{}
	options.AddCommand(libbox.CommandGroup)
	options.AddCommand(libbox.CommandStatus)
	client := libbox.NewCommandClient(handler, options)
	if err := client.Connect(); err != nil {
		server.Close()
		return cErrorMessage("failed to connect command client")
	}

	commandServer = server
	commandClient = client
	activeHandler = handler
	return cEmptyString()
}

// stopServiceLocked tears down the process-global service. Caller holds serviceMu.
func stopServiceLocked() {
	if commandClient != nil {
		_ = commandClient.Disconnect()
		commandClient = nil
	}
	if commandServer != nil {
		commandServer.Close()
		commandServer = nil
	}
	activeHandler = nil
}

//export libbox_stop
func libbox_stop() {
	serviceMu.Lock()
	defer serviceMu.Unlock()
	stopServiceLocked()
}

//export libbox_start_with_tun
func libbox_start_with_tun(fd C.int32_t, cfg *C.char) *C.char {
	config := C.GoString(cfg)
	if err := libbox.CheckConfig(config); err != nil {
		return cErrorMessage("invalid configuration")
	}
	groups := urltestGroups(config)

	serviceMu.Lock()
	defer serviceMu.Unlock()

	// A no-TUN ping service cannot accept a TUN config: its platform has no fd
	// to hand to libbox. Stop it first so the fd-carrying platform is the one
	// libbox actually uses for this session.
	stopServiceLocked()

	server, err := libbox.NewCommandServer(noopServerHandler{}, &tunPlatform{fd: int32(fd)})
	if err != nil {
		return cErrorMessage("failed to create command server")
	}
	if err := server.Start(); err != nil {
		return cErrorMessage("failed to start command server")
	}
	if err := server.StartOrReloadService(config, &libbox.OverrideOptions{}); err != nil {
		server.Close()
		return cErrorMessage("failed to start sing-box service")
	}

	handler := newURLTestHandler()
	handler.setGroups(groups)
	options := &libbox.CommandClientOptions{}
	options.AddCommand(libbox.CommandGroup)
	options.AddCommand(libbox.CommandStatus)
	client := libbox.NewCommandClient(handler, options)
	if err := client.Connect(); err != nil {
		server.Close()
		return cErrorMessage("failed to connect command client")
	}

	commandServer = server
	commandClient = client
	activeHandler = handler
	return cEmptyString()
}

//export libbox_traffic
func libbox_traffic() *C.char {
	serviceMu.Lock()
	handler := activeHandler
	serviceMu.Unlock()
	result := trafficResult{}
	if handler != nil {
		handler.mu.Lock()
		result.Down = handler.downTotal
		result.Up = handler.upTotal
		result.Available = handler.trafficAvailable
		handler.mu.Unlock()
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return cEmptyString()
	}
	return C.CString(string(encoded))
}

//export urltest
func urltest(tag *C.char, timeoutMs C.int) C.int {
	outboundTag := C.GoString(tag)
	serviceMu.Lock()
	client := commandClient
	handler := activeHandler
	serviceMu.Unlock()
	if outboundTag == "" || client == nil || handler == nil {
		return -1
	}

	timeout := time.Duration(timeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	deadline := time.Now().Add(timeout)

	// Drop any previous history for this tag so a stale success cannot be
	// mistaken for the result of this trigger.
	ch := make(chan struct{}, 1)
	handler.mu.Lock()
	// When the caller passes a urltest group member, trigger the group instead:
	// only the group carries the fixed generate_204 probe URL (D-06). The
	// waiter stays on the member tag, which WriteGroups signals directly.
	triggerTag := outboundTag
	if group, ok := handler.groupFor[outboundTag]; ok {
		triggerTag = group
		delete(handler.records, group)
	}
	delete(handler.records, outboundTag)
	if handler.waiters[outboundTag] == nil {
		handler.waiters[outboundTag] = make(map[chan struct{}]struct{})
	}
	handler.waiters[outboundTag][ch] = struct{}{}
	handler.mu.Unlock()
	defer func() {
		handler.mu.Lock()
		delete(handler.waiters[outboundTag], ch)
		if len(handler.waiters[outboundTag]) == 0 {
			delete(handler.waiters, outboundTag)
		}
		handler.mu.Unlock()
	}()

	errCh := make(chan error, 1)
	go func() { errCh <- client.URLTest(triggerTag) }()

	select {
	case err := <-errCh:
		if err != nil {
			return -2
		}
	case <-time.After(time.Until(deadline)):
		return -3
	}

	// The RTT is pushed asynchronously via WriteGroups; wait for that update.
	select {
	case <-ch:
	case <-time.After(time.Until(deadline)):
		return 0
	}

	handler.mu.Lock()
	record := handler.records[outboundTag]
	online := record.timeS > 0 && record.delayMs > 0
	handler.mu.Unlock()
	if online {
		return 1
	}
	return 0
}

//export urltest_take
func urltest_take(tag *C.char) *C.char {
	serviceMu.Lock()
	handler := activeHandler
	serviceMu.Unlock()
	result := urltestResult{Online: false, RttMs: 0}
	if handler != nil {
		handler.mu.Lock()
		record := handler.records[C.GoString(tag)]
		result.Online = record.timeS > 0 && record.delayMs > 0
		if result.Online {
			result.RttMs = int(record.delayMs)
		}
		handler.mu.Unlock()
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return cEmptyString()
	}
	return C.CString(string(encoded))
}

//export libbox_free_string
func libbox_free_string(value *C.char) {
	if value != nil {
		C.free(unsafe.Pointer(value))
	}
}

func main() {}
