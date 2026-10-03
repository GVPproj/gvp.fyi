// Package preview retrieves bounded, untrusted metadata without persisting anything.
package preview

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"

	_ "golang.org/x/image/webp"
	"golang.org/x/net/html"
)

const (
	MaxImageBytes     = 5 << 20
	MaxImageDimension = 4096
	MaxImagePixels    = 8_000_000
	MaxPageBytes      = 1 << 20
	Timeout           = 12 * time.Second
	MaxRedirects      = 4
)

var ErrFetch = errors.New("Preview could not be retrieved.")

type Image struct {
	SourceURL string `json:"sourceURL"`
	FinalURL  string `json:"finalURL"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Base64    string `json:"base64"`
}
type Result struct {
	SourceURL   string `json:"sourceURL"`
	FinalURL    string `json:"finalURL"`
	FetchedAt   string `json:"fetchedAt"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       *Image `json:"image"`
	Warning     string `json:"warning"`
}

// Network is an explicit test seam. Zero values use real DNS and TCP; production
// must never install an unvalidated transport or a proxy.
type Network struct {
	LookupIP    func(context.Context, string) ([]net.IP, error)
	DialContext func(context.Context, string, string) (net.Conn, error)
}
type Fetcher struct{ network Network }

func NewFetcher(n Network) *Fetcher {
	if n.LookupIP == nil {
		n.LookupIP = func(ctx context.Context, host string) ([]net.IP, error) {
			return net.DefaultResolver.LookupIP(ctx, "ip", host)
		}
	}
	if n.DialContext == nil {
		n.DialContext = (&net.Dialer{Timeout: 4 * time.Second}).DialContext
	}
	return &Fetcher{network: n}
}

// Conservative exclusions include transition, benchmarking, documentation and
// reserved ranges, not just RFC1918. 168.63.129.16 is Azure's platform virtual IP,
// not an ordinary public web destination. IPv6 is restricted to unicast 2000::/3.
var blocked = prefixes("0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "168.63.129.16/32", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.31.196.0/24", "192.52.193.0/24", "192.88.99.0/24", "192.175.48.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/3", "2001::/23", "2001:db8::/32", "2002::/16", "2620:4f:8000::/48", "3fff::/20")

func prefixes(values ...string) []netip.Prefix {
	out := make([]netip.Prefix, len(values))
	for i, v := range values {
		out[i] = netip.MustParsePrefix(v)
	}
	return out
}
func public(ip net.IP) bool {
	a, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	a = a.Unmap()
	if !a.IsGlobalUnicast() {
		return false
	}
	if a.Is6() && !netip.MustParsePrefix("2000::/3").Contains(a) {
		return false
	}
	for _, p := range blocked {
		if p.Contains(a) {
			return false
		}
	}
	return true
}
func validURL(raw string) (*url.URL, error) {
	if len(raw) > 4096 {
		return nil, ErrFetch
	}
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" || u.User != nil || u.Opaque != "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, ErrFetch
	}
	if strings.Contains(u.Hostname(), "%") || (u.Port() != "" && !((u.Scheme == "http" && u.Port() == "80") || (u.Scheme == "https" && u.Port() == "443"))) {
		return nil, ErrFetch
	}
	if ip := net.ParseIP(u.Hostname()); ip != nil && !public(ip) {
		return nil, ErrFetch
	}
	u.Fragment = ""
	return u, nil
}
func (f *Fetcher) client() *http.Client {
	transport := &http.Transport{
		Proxy: nil, DisableKeepAlives: true, DisableCompression: true,
		TLSHandshakeTimeout: 4 * time.Second, ResponseHeaderTimeout: 4 * time.Second, MaxResponseHeaderBytes: 32 << 10,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, ErrFetch
			}
			ips, err := f.network.LookupIP(ctx, host)
			if err != nil || len(ips) == 0 {
				return nil, ErrFetch
			}
			for _, ip := range ips {
				if !public(ip) {
					return nil, ErrFetch
				}
			}
			// Dial the checked literal, never the original hostname (DNS rebinding).
			return f.network.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
		},
	}
	return &http.Client{Transport: transport, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > MaxRedirects {
			return ErrFetch
		}
		_, err := validURL(req.URL.String())
		return err
	}}
}
func download(ctx context.Context, client *http.Client, raw string, limit int64) ([]byte, string, string, error) {
	u, err := validURL(raw)
	if err != nil {
		return nil, "", "", ErrFetch
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, "", "", ErrFetch
	}
	req.Header.Set("User-Agent", "LikesPreview/1.0")
	res, err := client.Do(req)
	if err != nil {
		return nil, "", "", ErrFetch
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK || res.ContentLength > limit || (res.Header.Get("Content-Encoding") != "" && res.Header.Get("Content-Encoding") != "identity") {
		return nil, "", "", ErrFetch
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil || int64(len(body)) > limit {
		return nil, "", "", ErrFetch
	}
	return body, res.Request.URL.String(), res.Header.Get("Content-Type"), nil
}
func (f *Fetcher) Fetch(ctx context.Context, raw string) (*Result, error) {
	ctx, cancel := context.WithTimeout(ctx, Timeout)
	defer cancel()
	client := f.client()
	defer client.CloseIdleConnections()
	body, final, typ, err := download(ctx, client, raw, MaxPageBytes)
	if err != nil {
		return nil, ErrFetch
	}
	mediaType, _, typeErr := mime.ParseMediaType(typ)
	if typeErr != nil || mediaType != "text/html" {
		return nil, ErrFetch
	}
	doc, err := html.Parse(strings.NewReader(string(body)))
	if err != nil {
		return nil, ErrFetch
	}
	meta := map[string]string{}
	title := ""
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "meta" {
			key, value := "", ""
			for _, a := range n.Attr {
				if a.Key == "property" || a.Key == "name" {
					key = strings.ToLower(a.Val)
				}
				if a.Key == "content" {
					value = a.Val
				}
			}
			if meta[key] == "" {
				meta[key] = value
			}
		}
		if n.Type == html.ElementNode && n.Data == "title" && title == "" && n.FirstChild != nil {
			title = n.FirstChild.Data
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	if ctx.Err() != nil {
		return nil, ErrFetch
	}
	result := &Result{SourceURL: raw, FinalURL: final, FetchedAt: time.Now().UTC().Format(time.RFC3339), Title: clean(first(meta["og:title"], meta["twitter:title"], title), 300), Description: clean(first(meta["og:description"], meta["twitter:description"], meta["description"]), 2000)}
	if result.Title == "" && result.Description == "" {
		result.Warning = "No metadata found. You can enter it manually."
	}
	if source := first(meta["og:image"], meta["twitter:image"]); source != "" {
		base, _ := url.Parse(final)
		relative, parseErr := url.Parse(source)
		if parseErr == nil {
			result.Image = f.fetchImage(ctx, client, base.ResolveReference(relative).String())
		}
		if result.Image == nil {
			result.Warning = "Preview image could not be retrieved. You can save without it."
		}
	}
	return result, nil
}
func (f *Fetcher) fetchImage(ctx context.Context, client *http.Client, source string) *Image {
	body, final, _, err := download(ctx, client, source, MaxImageBytes)
	if err != nil {
		return nil
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(body))
	types := map[string]string{"jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}
	if err != nil || types[format] == "" || config.Width < 1 || config.Height < 1 || config.Width > MaxImageDimension || config.Height > MaxImageDimension || int64(config.Width)*int64(config.Height) > MaxImagePixels {
		return nil
	}
	// Decode after checking dimensions, so corrupt/truncated payloads aren't accepted.
	if _, decoded, err := image.Decode(bytes.NewReader(body)); err != nil || decoded != format || ctx.Err() != nil {
		return nil
	}
	ext := format
	if ext == "jpeg" {
		ext = "jpg"
	}
	return &Image{SourceURL: source, FinalURL: final, Name: "preview." + ext, Type: types[format], Base64: base64.StdEncoding.EncodeToString(body)}
}
func first(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
func clean(v string, max int) string {
	v = strings.Join(strings.Fields(v), " ")
	r := []rune(v)
	if len(r) > max {
		return string(r[:max])
	}
	return v
}
