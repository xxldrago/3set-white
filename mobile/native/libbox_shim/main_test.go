package main

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/sagernet/sing-box/experimental/libbox"
)

// fullTUNConfig builds the smoke-proven TUN shape from 20-RESEARCH.md §1.
// The exact research values are asserted by TestTUNConfigVectorResearchValues.
// This test NEVER calls libbox_start_with_tun: a non-TUN fd aborts the process
// (exit 134 SIGABRT) and only a real platform TUN fd may be handed to the shim.
func fullTUNConfig(t *testing.T) string {
	t.Helper()
	config := map[string]any{
		"log": map[string]any{"level": "error"},
		"dns": map[string]any{
			"servers": []any{map[string]any{"type": "local", "tag": "local"}},
			"final":   "local",
		},
		"inbounds": []any{
			map[string]any{
				"type":         "tun",
				"tag":          "tun-in",
				"address":      []string{"172.18.0.1/30", "fdfe:dcba:9876::1/126"},
				"mtu":          1500,
				"dns_mode":     "hijack",
				"dns_address":  []string{"172.18.0.2", "fdfe:dcba:9876::2"},
				"auto_route":   true,
				"strict_route": true,
				"stack":        "gvisor",
			},
		},
		"endpoints": []any{},
		// CR-01: the chosen server tag is the default route target. `direct`
		// stays declared only as a fallback, never as the effective outbound.
		"outbounds": []any{
			map[string]any{"type": "direct", "tag": "direct"},
			map[string]any{"type": "direct", "tag": "srv-smoke"},
		},
		"route": map[string]any{
			"rules": []any{map[string]any{"outbound": "srv-smoke"}},
			"final": "srv-smoke",
		},
	}
	encoded, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("marshal full TUN config: %v", err)
	}
	return string(encoded)
}

func TestTUNConfigVectorResearchValues(t *testing.T) {
	var parsed struct {
		DNS struct {
			Servers []struct {
				Type string `json:"type"`
				Tag  string `json:"tag"`
			} `json:"servers"`
			Final string `json:"final"`
		} `json:"dns"`
		Inbounds []struct {
			Type        string   `json:"type"`
			Tag         string   `json:"tag"`
			Address     []string `json:"address"`
			MTU         int      `json:"mtu"`
			DNSMode     string   `json:"dns_mode"`
			DNSAddress  []string `json:"dns_address"`
			AutoRoute   bool     `json:"auto_route"`
			StrictRoute bool     `json:"strict_route"`
			Stack       string   `json:"stack"`
		} `json:"inbounds"`
		Route struct {
			Rules []struct {
				Outbound string `json:"outbound"`
			} `json:"rules"`
			Final string `json:"final"`
		} `json:"route"`
	}
	if err := json.Unmarshal([]byte(fullTUNConfig(t)), &parsed); err != nil {
		t.Fatalf("unmarshal test vector: %v", err)
	}
	if len(parsed.Inbounds) != 1 {
		t.Fatalf("expected exactly one TUN inbound, got %d", len(parsed.Inbounds))
	}
	in := parsed.Inbounds[0]
	if in.Type != "tun" || in.Tag != "tun-in" {
		t.Fatalf("unexpected inbound identity: %+v", in)
	}
	if got := strings.Join(in.Address, ","); got != "172.18.0.1/30,fdfe:dcba:9876::1/126" {
		t.Fatalf("unexpected TUN addresses: %s", got)
	}
	if in.MTU != 1500 || in.DNSMode != "hijack" {
		t.Fatalf("unexpected MTU/DNS mode: %d/%s", in.MTU, in.DNSMode)
	}
	if got := strings.Join(in.DNSAddress, ","); got != "172.18.0.2,fdfe:dcba:9876::2" {
		t.Fatalf("unexpected DNS addresses: %s", got)
	}
	if !in.AutoRoute || !in.StrictRoute || in.Stack != "gvisor" {
		t.Fatalf("unexpected route/stack flags: %+v", in)
	}
	if parsed.DNS.Final != "local" || len(parsed.DNS.Servers) != 1 ||
		parsed.DNS.Servers[0].Type != "local" || parsed.DNS.Servers[0].Tag != "local" {
		t.Fatalf("unexpected new-format DNS: %+v", parsed.DNS)
	}
	// CR-01: route.final must select the paid server, never the direct fallback.
	if parsed.Route.Final != "srv-smoke" || parsed.Route.Final == "direct" {
		t.Fatalf("unexpected route.final: %s", parsed.Route.Final)
	}
	if len(parsed.Route.Rules) != 1 || parsed.Route.Rules[0].Outbound != "srv-smoke" {
		t.Fatalf("unexpected route.rules: %+v", parsed.Route.Rules)
	}
}

func TestCheckConfigAcceptsFullTUNConfig(t *testing.T) {
	config := fullTUNConfig(t)
	if err := libbox.CheckConfig(config); err != nil {
		t.Fatalf("CheckConfig rejected the full TUN config: %v", err)
	}
}

// WR-02: the TUN platform must protect every outbound socket through the
// installed callback instead of letting our own full routes capture the dial.
func TestTunPlatformProtectsOutboundSockets(t *testing.T) {
	protected := make([]int32, 0)
	protectHookForTesting = func(fd int32) bool {
		protected = append(protected, fd)
		return fd == 42
	}
	defer func() { protectHookForTesting = nil }()

	platform := &tunPlatform{fd: 7}
	if !platform.UsePlatformAutoDetectInterfaceControl() {
		t.Fatal("TUN platform must opt into auto-detect interface control")
	}
	if err := platform.AutoDetectInterfaceControl(42); err != nil {
		t.Fatalf("protected socket was rejected: %v", err)
	}
	if len(protected) != 1 || protected[0] != 42 {
		t.Fatalf("protection hook did not receive the fd: %v", protected)
	}
	// A refused protection (or an invalid fd) fails the dial: never loop it
	// back through the tunnel.
	if err := platform.AutoDetectInterfaceControl(43); err == nil {
		t.Fatal("expected an error when the platform refused protection")
	}
	if err := platform.AutoDetectInterfaceControl(-1); err == nil {
		t.Fatal("expected an error for an invalid fd")
	}
}

// WR-02: sing-box only calls ProtectFunc when route.auto_detect_interface is
// enabled. The shim turns it on for TUN sessions without touching the backend
// config contract; the resulting config must still pass CheckConfig.
func TestWithAutoDetectInterfaceKeepsConfigValid(t *testing.T) {
	got := withAutoDetectInterface(fullTUNConfig(t))
	if got == fullTUNConfig(t) {
		t.Fatal("auto_detect_interface was not injected")
	}
	var parsed struct {
		Route struct {
			AutoDetectInterface bool   `json:"auto_detect_interface"`
			Final               string `json:"final"`
		} `json:"route"`
	}
	if err := json.Unmarshal([]byte(got), &parsed); err != nil {
		t.Fatalf("unmarshal injected config: %v", err)
	}
	if !parsed.Route.AutoDetectInterface || parsed.Route.Final != "srv-smoke" {
		t.Fatalf("unexpected injected route: %+v", parsed.Route)
	}
	if err := libbox.CheckConfig(got); err != nil {
		t.Fatalf("CheckConfig rejected the protection-enabled config: %v", err)
	}
}

func TestGenericErrorMessageNeverEchoesConfigFragment(t *testing.T) {
	const secretFragment = "vless://SUPERSECRET@config-fragment.example"
	got := checkConfigErrorText(
		`{"inbounds":[{"type":"not-a-real-inbound","tag":"` + secretFragment + `"}]}`,
	)
	if got != "invalid configuration" {
		t.Fatalf("expected the fixed generic message, got %q", got)
	}
	if strings.Contains(got, secretFragment) || strings.Contains(got, "SUPERSECRET") {
		t.Fatalf("generic error echoed the config fragment: %q", got)
	}
}
