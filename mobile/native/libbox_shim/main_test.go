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
		"outbounds": []any{
			map[string]any{"type": "direct", "tag": "direct"},
		},
		"route": map[string]any{"final": "direct"},
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
	if parsed.Route.Final != "direct" {
		t.Fatalf("unexpected route.final: %s", parsed.Route.Final)
	}
}

func TestCheckConfigAcceptsFullTUNConfig(t *testing.T) {
	config := fullTUNConfig(t)
	if err := libbox.CheckConfig(config); err != nil {
		t.Fatalf("CheckConfig rejected the full TUN config: %v", err)
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
