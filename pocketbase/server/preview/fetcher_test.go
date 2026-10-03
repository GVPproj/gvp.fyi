package preview_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"gvp.fyi/pocketbase/server/preview"
)

// Keep the IP-pinning assertion identical for every controlled network fixture.
func fixtureDialer(t *testing.T, server *httptest.Server) func(context.Context, string, string) (net.Conn, error) {
	t.Helper()
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		if address != "93.184.216.34:80" {
			t.Errorf("dial must use validated IP, got %s", address)
		}
		return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
	}
}

func fixture(t *testing.T, handler http.HandlerFunc) *preview.Fetcher {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return preview.NewFetcher(preview.Network{
		LookupIP:    func(context.Context, string) ([]net.IP, error) { return []net.IP{net.ParseIP("93.184.216.34")}, nil },
		DialContext: fixtureDialer(t, server),
	})
}

func TestMissingMetadataAndUpstreamFailures(t *testing.T) {
	f := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/failure" {
			http.Error(w, "secret upstream detail", 500)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<script>document.title='not executed'</script>`))
	})
	result, err := f.Fetch(context.Background(), "http://example.com/")
	if err != nil || result.Title != "" || result.Warning == "" {
		t.Fatalf("missing metadata must be visible: %+v %v", result, err)
	}
	_, err = f.Fetch(context.Background(), "http://example.com/failure")
	if err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatalf("unsafe error: %v", err)
	}
}

func TestImageIsReturnedAsValidatedBytesWithoutStorage(t *testing.T) {
	var data bytes.Buffer
	_ = png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 2, 3)))
	f := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cover.png" {
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(data.Bytes())
			return
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<title>Preview</title><meta property="og:image" content="/cover.png">`))
	})
	result, err := f.Fetch(context.Background(), "http://example.com/article")
	if err != nil {
		t.Fatal(err)
	}
	if result.Image == nil || result.Image.Type != "image/png" || result.Image.Name != "preview.png" || result.Image.SourceURL != "http://example.com/cover.png" || result.Image.FinalURL != result.Image.SourceURL || result.Image.Base64 != base64.StdEncoding.EncodeToString(data.Bytes()) {
		t.Fatalf("unexpected image: %+v", result.Image)
	}
}

func TestUnsafeURLsAndDNSAnswersNeverReachNetwork(t *testing.T) {
	for _, raw := range []string{"http://127.0.0.1/", "http://[::1]/", "file:///etc/passwd", "ftp://example.com/", "http://user:pass@example.com/", "http://example.com:8080/", "https://example.com:80/", "http://[fe80::1%25eth0]/"} {
		t.Run(raw, func(t *testing.T) {
			f := preview.NewFetcher(preview.Network{LookupIP: func(context.Context, string) ([]net.IP, error) {
				t.Error("invalid URL reached DNS")
				return nil, fmt.Errorf("unexpected DNS")
			}})
			if _, err := f.Fetch(context.Background(), raw); err == nil {
				t.Fatal("accepted unsafe URL")
			}
		})
	}
	for _, ip := range []string{"127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "168.63.129.16", "100.100.100.200", "0.0.0.0", "192.0.0.9", "192.0.2.1", "192.31.196.1", "192.52.193.1", "192.175.48.1", "2620:4f:8000::1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "64:ff9b::a00:1", "2001::1", "2001:db8::1", "2002:7f00:1::", "3fff::1"} {
		t.Run(ip, func(t *testing.T) {
			f := preview.NewFetcher(preview.Network{LookupIP: func(context.Context, string) ([]net.IP, error) {
				return []net.IP{net.ParseIP("93.184.216.34"), net.ParseIP(ip)}, nil
			}, DialContext: func(context.Context, string, string) (net.Conn, error) {
				t.Error("unsafe DNS answer reached TCP")
				return nil, fmt.Errorf("unexpected TCP")
			}})
			if _, err := f.Fetch(context.Background(), "http://example.com/"); err == nil {
				t.Fatal("accepted unsafe DNS answer")
			}
		})
	}
}

func TestRedirectRevalidatesDNSAndPinsEachDial(t *testing.T) {
	var lookups, dials atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/again", 302) }))
	defer server.Close()
	dial := fixtureDialer(t, server)
	f := preview.NewFetcher(preview.Network{
		LookupIP: func(context.Context, string) ([]net.IP, error) {
			if lookups.Add(1) == 1 {
				return []net.IP{net.ParseIP("93.184.216.34")}, nil
			}
			return []net.IP{net.ParseIP("127.0.0.1")}, nil
		},
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			dials.Add(1)
			return dial(ctx, network, address)
		},
	})
	if _, err := f.Fetch(context.Background(), "http://example.com/"); err == nil {
		t.Fatal("accepted rebound redirect")
	}
	if lookups.Load() != 2 || dials.Load() != 1 {
		t.Fatalf("lookups=%d dials=%d", lookups.Load(), dials.Load())
	}
}

func TestRedirectsLimitsAndMaliciousImages(t *testing.T) {
	for _, mode := range []string{"redirect-loop", "redirect-credentials", "large-page", "encoded-page", "invalid-content-type", "image-svg", "image-truncated", "image-large", "image-dimensions", "image-private-redirect"} {
		t.Run(mode, func(t *testing.T) {
			var requests int
			f := fixture(t, func(w http.ResponseWriter, r *http.Request) {
				requests++
				w.Header().Set("Content-Type", "text/html")
				if r.URL.Path == "/image" {
					switch mode {
					case "image-svg":
						_, _ = w.Write([]byte(`<svg onload="alert(1)"></svg>`))
					case "image-truncated":
						_, _ = w.Write([]byte("\x89PNG\r\n\x1a\n"))
					case "image-large":
						_, _ = w.Write([]byte(strings.Repeat("x", preview.MaxImageBytes+1)))
					case "image-dimensions":
						_ = png.Encode(w, image.NewGray(image.Rect(0, 0, preview.MaxImageDimension+1, 1)))
					case "image-private-redirect":
						http.Redirect(w, r, "http://user:pass@127.0.0.1/", 302)
					}
					return
				}
				switch mode {
				case "redirect-loop":
					http.Redirect(w, r, "/again", 302)
				case "redirect-credentials":
					http.Redirect(w, r, "http://user:pass@example.com/", 302)
				case "large-page":
					_, _ = w.Write([]byte(strings.Repeat("x", preview.MaxPageBytes+1)))
				case "invalid-content-type":
					w.Header().Set("Content-Type", "text/html-malicious")
					_, _ = w.Write([]byte(`<title>Not HTML</title>`))
				case "encoded-page":
					w.Header().Set("Content-Encoding", "gzip")
					_, _ = w.Write([]byte("untrusted"))
				default:
					_, _ = fmt.Fprint(w, `<title>Keep title</title><meta property="og:image" content="/image">`)
				}
			})
			result, err := f.Fetch(context.Background(), "http://example.com/")
			if strings.HasPrefix(mode, "image-") {
				if err != nil || result.Image != nil || result.Warning == "" || result.Title != "Keep title" {
					t.Fatalf("image failure lost metadata: %+v %v", result, err)
				}
			} else if err == nil {
				t.Fatal("expected bounded failure")
			}
			if mode == "redirect-loop" && requests > preview.MaxRedirects+1 {
				t.Fatalf("unbounded redirects: %d", requests)
			}
		})
	}
}

func TestSharedDeadlineIncludesDNS(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		f := preview.NewFetcher(preview.Network{LookupIP: func(ctx context.Context, _ string) ([]net.IP, error) { <-ctx.Done(); return nil, ctx.Err() }})
		start := time.Now()
		if _, err := f.Fetch(context.Background(), "http://example.com/"); err == nil {
			t.Fatal("timeout succeeded")
		}
		if elapsed := time.Since(start); elapsed != preview.Timeout {
			t.Fatalf("unexpected deadline: %s", elapsed)
		}
	})
}

func TestSupportedImagesAndRelativeURLsAfterRedirects(t *testing.T) {
	for _, format := range []string{"jpeg", "gif", "webp"} {
		t.Run(format, func(t *testing.T) {
			var data bytes.Buffer
			img := image.NewRGBA(image.Rect(0, 0, 2, 2))
			switch format {
			case "jpeg":
				_ = jpeg.Encode(&data, img, nil)
			case "gif":
				_ = gif.Encode(&data, img, nil)
			case "webp":
				b, err := base64.StdEncoding.DecodeString("UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAgA0JaACdLoB+AADsAD+8Oj3/yC5YXXI1/8gP+QH/ID/+PIAAAA=")
				if err != nil {
					t.Fatal(err)
				}
				data.Write(b)
			}
			f := fixture(t, func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/":
					http.Redirect(w, r, "/articles/final", 302)
				case "/articles/final":
					w.Header().Set("Content-Type", "text/html; charset=utf-8")
					_, _ = w.Write([]byte(`<base href="http://127.0.0.1/"><title>Fallback &amp; title</title><meta name="twitter:image" content="cover"><meta name="twitter:description" content="Summary">`))
				case "/articles/cover":
					http.Redirect(w, r, "/asset", 302)
				case "/asset":
					w.Header().Set("Content-Type", "application/octet-stream")
					_, _ = w.Write(data.Bytes())
				default:
					t.Errorf("unexpected request: %s", r.URL)
					http.NotFound(w, r)
				}
			})
			result, err := f.Fetch(context.Background(), "http://example.com/")
			if err != nil {
				t.Fatal(err)
			}
			if result.FinalURL != "http://example.com/articles/final" || result.Title != "Fallback & title" || result.Description != "Summary" || result.Image == nil {
				t.Fatalf("bad result: %+v", result)
			}
			if result.Image.SourceURL != "http://example.com/articles/cover" || result.Image.FinalURL != "http://example.com/asset" || result.Image.Type != "image/"+format {
				t.Fatalf("bad image provenance/type: %+v", result.Image)
			}
		})
	}
}

func TestImageDNSIsValidatedIndependently(t *testing.T) {
	var dials atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<title>Keep</title><meta property="og:image" content="http://private.example/secret">`))
	}))
	defer server.Close()
	dial := fixtureDialer(t, server)
	f := preview.NewFetcher(preview.Network{
		LookupIP: func(_ context.Context, host string) ([]net.IP, error) {
			if host == "private.example" {
				return []net.IP{net.ParseIP("10.0.0.1")}, nil
			}
			return []net.IP{net.ParseIP("93.184.216.34")}, nil
		},
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			dials.Add(1)
			return dial(ctx, network, address)
		},
	})
	result, err := f.Fetch(context.Background(), "http://example.com/")
	if err != nil || result.Image != nil || result.Warning == "" || dials.Load() != 1 {
		t.Fatalf("unsafe image fetch: %+v %v dials=%d", result, err, dials.Load())
	}
}

func TestCancellationStopsFetch(t *testing.T) {
	f := preview.NewFetcher(preview.Network{LookupIP: func(ctx context.Context, _ string) ([]net.IP, error) { <-ctx.Done(); return nil, ctx.Err() }})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := f.Fetch(ctx, "http://example.com/"); err == nil {
		t.Fatal("canceled request succeeded")
	}
}

func TestRedirectedPageAndImagePreserveSourceAttribution(t *testing.T) {
	var data bytes.Buffer
	_ = png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 2, 3)))
	f := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/start":
			http.Redirect(w, r, "/article/final", http.StatusFound)
		case "/article/final":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<title>Redirected title</title><meta property="og:image" content="cover">`))
		case "/article/cover":
			http.Redirect(w, r, "http://cdn.example.com/image.png", http.StatusTemporaryRedirect)
		case "/image.png":
			_, _ = w.Write(data.Bytes())
		default:
			t.Errorf("unexpected fixture URL: %s", r.URL)
		}
	})
	result, err := f.Fetch(context.Background(), "http://example.com/start")
	if err != nil {
		t.Fatal(err)
	}
	if result.SourceURL != "http://example.com/start" || result.FinalURL != "http://example.com/article/final" || result.Title != "Redirected title" {
		t.Fatalf("lost page attribution: %+v", result)
	}
	if result.Image == nil || result.Image.SourceURL != "http://example.com/article/cover" || result.Image.FinalURL != "http://cdn.example.com/image.png" {
		t.Fatalf("lost image attribution: %+v", result.Image)
	}
}

func TestFetchedTitleFitsTheOwnerEditor(t *testing.T) {
	f := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprint(w, "<title>"+strings.Repeat("x", 600)+"</title>")
	})
	result, err := f.Fetch(context.Background(), "http://example.com/")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Title) != 300 {
		t.Fatalf("title exceeds editor limit: %d", len(result.Title))
	}
}

func TestFetchMetadataWithoutExecutingHTML(t *testing.T) {
	f := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><head><title>Fallback</title><meta property="og:title" content="A &amp; B"><meta name="description" content="Useful text"><script>fetch('/private')</script></head></html>`))
	})
	result, err := f.Fetch(context.Background(), "http://example.com/article")
	if err != nil {
		t.Fatal(err)
	}
	if result.Title != "A & B" || result.Description != "Useful text" || result.SourceURL != "http://example.com/article" || result.FinalURL != result.SourceURL || result.FetchedAt == "" || result.Image != nil || result.Warning != "" {
		t.Fatalf("unexpected preview: %+v", result)
	}
}
