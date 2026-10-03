package preview_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"gvp.fyi/pocketbase/server/preview"
)

func apiFixture(t *testing.T, f *preview.Fetcher) (http.Handler, map[string]string) {
	t.Helper()
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	tokens := map[string]string{}
	for _, name := range []string{"likes_owners", "other_owners"} {
		collection := core.NewAuthCollection(name)
		if err := app.Save(collection); err != nil {
			t.Fatal(err)
		}
		ids := []string{"likesowner00001", "notowner0000001"}
		if name == "other_owners" {
			ids = []string{"otherowner00001"}
		}
		for _, id := range ids {
			record := core.NewRecord(collection)
			record.Id = id
			record.SetEmail(id + "@example.com")
			record.SetPassword("test-password-12345")
			if err := app.Save(record); err != nil {
				t.Fatal(err)
			}
			token, err := record.NewAuthToken()
			if err != nil {
				t.Fatal(err)
			}
			tokens[name+"/"+id] = token
		}
	}
	super := core.NewRecord(mustCollection(t, app, "_superusers"))
	super.SetEmail("admin@example.com")
	super.SetPassword("test-password-12345")
	if err := app.Save(super); err != nil {
		t.Fatal(err)
	}
	tokens["super"], err = super.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	preview.NewAPI(f).Register(app)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	event := &core.ServeEvent{App: app, Router: router}
	if err := app.OnServe().Trigger(event); err != nil {
		t.Fatal(err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return mux, tokens
}
func mustCollection(t *testing.T, app core.App, name string) *core.Collection {
	t.Helper()
	c, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		t.Fatal(err)
	}
	return c
}
func request(mux http.Handler, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/likes/preview", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", token)
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)
	return res
}
func TestAPIRejectsMalformedInputBeforeNetwork(t *testing.T) {
	var calls atomic.Int32
	f := fixture(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); http.Error(w, "secret upstream body", 500) })
	mux, tokens := apiFixture(t, f)
	owner := tokens["likes_owners/likesowner00001"]
	for _, body := range []string{`{"url":"http://example.com/","extra":true}`, `{"url":"http://example.com/"} {}`, `{"url":123}`, `{"url":"file:///etc/passwd"}`, `{"url":"` + strings.Repeat("a", 9000) + `"}`} {
		res := request(mux, owner, body)
		if res.Code != 400 {
			t.Fatalf("invalid input got %d", res.Code)
		}
	}
	if calls.Load() != 0 {
		t.Fatal("invalid input reached network")
	}
	res := request(mux, owner, `{"url":"http://example.com/"}`)
	if res.Code != 422 || strings.Contains(res.Body.String(), "secret") {
		t.Fatalf("unsafe failure: %d %s", res.Code, res.Body.String())
	}
}

func TestAPIConcurrencyBoundRejectsBeforeNetworkAndReleasesSlots(t *testing.T) {
	started := make(chan struct{}, preview.MaxConcurrent+1)
	release := make(chan struct{})
	var calls atomic.Int32
	f := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) <= int32(preview.MaxConcurrent) {
			started <- struct{}{}
			<-release
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<title>Done</title>`))
	})
	mux, tokens := apiFixture(t, f)
	owner := tokens["likes_owners/likesowner00001"]
	responses := make(chan int, preview.MaxConcurrent)
	for i := 0; i < preview.MaxConcurrent; i++ {
		go func() { responses <- request(mux, owner, `{"url":"http://example.com/"}`).Code }()
	}
	for i := 0; i < preview.MaxConcurrent; i++ {
		select {
		case <-started:
		case <-time.After(3 * time.Second):
			close(release)
			t.Fatal("fetch did not start")
		}
	}
	res := request(mux, owner, `{"url":"http://example.com/"}`)
	close(release)
	if res.Code != 429 {
		t.Fatalf("concurrent overflow got %d", res.Code)
	}
	for i := 0; i < preview.MaxConcurrent; i++ {
		if code := <-responses; code != 200 {
			t.Fatalf("admitted request got %d", code)
		}
	}
	if calls.Load() != int32(preview.MaxConcurrent) {
		t.Fatal("overflow reached network")
	}
	if res := request(mux, owner, `{"url":"http://example.com/"}`); res.Code != 200 {
		t.Fatalf("slot not released: %d", res.Code)
	}
}

func TestAPIOwnerAuthorizationContractAndRateLimit(t *testing.T) {
	var calls atomic.Int32
	f := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<title>From fixture</title>`))
	})
	mux, tokens := apiFixture(t, f)
	for _, key := range []string{"", "super", "likes_owners/notowner0000001", "other_owners/otherowner00001"} {
		res := request(mux, tokens[key], `{"url":"http://example.com/"}`)
		if res.Code != http.StatusForbidden {
			t.Fatalf("%q got %d: %s", key, res.Code, res.Body.String())
		}
	}
	if calls.Load() != 0 {
		t.Fatal("unauthorized request reached network")
	}
	owner := tokens["likes_owners/likesowner00001"]
	for i := 0; i < preview.RequestsPerMinute; i++ {
		res := request(mux, owner, `{"url":"http://example.com/"}`)
		if res.Code != 200 {
			t.Fatalf("owner got %d: %s", res.Code, res.Body.String())
		}
		var result map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if len(result) != 7 || result["title"] != "From fixture" || result["image"] != nil || result["warning"] != "" {
			t.Fatalf("wrong contract: %+v", result)
		}
		if res.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("preview may be cached")
		}
	}
	res := request(mux, owner, `{"url":"http://example.com/"}`)
	if res.Code != 429 || calls.Load() != int32(preview.RequestsPerMinute) {
		t.Fatalf("rate limit failed: %d calls=%d", res.Code, calls.Load())
	}
}
