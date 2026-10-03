package duplicates_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"gvp.fyi/pocketbase/server/duplicates"
)

func apiFixture(t *testing.T) (http.Handler, map[string]string, core.App) {
	t.Helper()
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	tokens := map[string]string{}
	for _, name := range []string{"likes_owners", "other_owners", "_superusers"} {
		var collection *core.Collection
		if name == "_superusers" {
			collection, err = app.FindCollectionByNameOrId(name)
			if err != nil {
				t.Fatal(err)
			}
		} else {
			collection = core.NewAuthCollection(name)
			if err := app.Save(collection); err != nil {
				t.Fatal(err)
			}
		}
		ids := []string{"likesowner00001", "notowner0000001"}
		if name == "other_owners" {
			ids = []string{"otherowner00001"}
		} else if name == "_superusers" {
			ids = []string{"superuser000001"}
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
	collection := core.NewBaseCollection("likes_items")
	collection.Fields.Add(
		&core.TextField{Name: "url"}, &core.TextField{Name: "title"},
		&core.TextField{Name: "commentary"}, &core.BoolField{Name: "published"},
		&core.JSONField{Name: "previewProvenance"},
	)
	// Locked rules ensure the owner endpoint, not public record access, supplies drafts.
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}
	duplicates.Register(app)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}); err != nil {
		t.Fatal(err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return mux, tokens, app
}

func request(mux http.Handler, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/likes/duplicates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", token)
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)
	return res
}

func saveItem(t *testing.T, app core.App, url string, published bool) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("likes_items")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("url", url)
	record.Set("title", "A saved find")
	record.Set("commentary", "Owner commentary")
	record.Set("published", published)
	record.Set("previewProvenance", map[string]any{"title": "manual"})
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func lookup(t *testing.T, mux http.Handler, token, url string) []map[string]any {
	t.Helper()
	body, err := json.Marshal(map[string]string{"url": url})
	if err != nil {
		t.Fatal(err)
	}
	res := request(mux, token, string(body))
	if res.Code != http.StatusOK {
		t.Fatalf("lookup %q got %d: %s", url, res.Code, res.Body.String())
	}
	var result struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Items == nil {
		t.Fatal("items must be an array")
	}
	return result.Items
}

func TestAPIReturnsFullPublishedAndDraftMatches(t *testing.T) {
	mux, tokens, app := apiFixture(t)
	first := saveItem(t, app, "https://EXAMPLE.com:443", true)
	second := saveItem(t, app, " https://example.com/ ", false)
	saveItem(t, app, "https://example.com/elsewhere", true)
	items := lookup(t, mux, tokens["likes_owners/likesowner00001"], "  HTTPS://Example.COM/  ")
	if len(items) != 2 {
		t.Fatalf("wanted both matches, got %+v", items)
	}
	expected := map[string]*core.Record{first.Id: first, second.Id: second}
	for _, item := range items {
		id, _ := item["id"].(string)
		record := expected[id]
		if record == nil {
			t.Fatalf("unexpected item: %+v", item)
		}
		if item["url"] != record.GetString("url") || item["published"] != record.GetBool("published") ||
			item["title"] != "A saved find" || item["commentary"] != "Owner commentary" || item["collectionName"] != "likes_items" || item["collectionId"] == "" {
			t.Fatalf("not a full record: %+v", item)
		}
		provenance, ok := item["previewProvenance"].(map[string]any)
		if !ok || provenance["title"] != "manual" {
			t.Fatalf("missing provenance: %+v", item)
		}
		delete(expected, id)
	}
	if len(expected) != 0 {
		t.Fatal("missing matching records")
	}
}

func TestAPIConservativeURLComparison(t *testing.T) {
	mux, tokens, app := apiFixture(t)
	owner := tokens["likes_owners/likesowner00001"]
	cases := []struct {
		name, stored, input string
		match               bool
	}{
		{"HTTP default port", "http://EXAMPLE.com:80", " HTTP://example.COM/ ", true},
		{"HTTPS default port", "https://example.com:443/a", "https://EXAMPLE.com/a", true},
		{"empty path with query", "https://example.com?q=1#top", "https://example.com/?q=1#top", true},
		{"IPv6 host case", "http://[2001:DB8::A]:80/a", "http://[2001:db8::a]/a", true},
		{"port zero is a valid destination", "http://example.com:0/a", "http://EXAMPLE.com:0/a", true},
		{"scheme", "http://example.com/a", "https://example.com/a", false},
		{"nondefault port", "https://example.com:8443/a", "https://example.com/a", false},
		{"hostname", "https://example.com/a", "https://www.example.com/a", false},
		{"path case", "https://example.com/A", "https://example.com/a", false},
		{"trailing slash", "https://example.com/a/", "https://example.com/a", false},
		{"query order", "https://example.com/?a=1&b=2", "https://example.com/?b=2&a=1", false},
		{"tracking", "https://example.com/?utm_source=x", "https://example.com/", false},
		{"fragment", "https://example.com/#one", "https://example.com/#two", false},
		{"empty fragment", "https://example.com/#", "https://example.com/", false},
		{"empty query", "https://example.com/?", "https://example.com/", false},
		{"escaped path", "https://example.com/%61", "https://example.com/a", false},
		{"escape hex case", "https://example.com/%2f", "https://example.com/%2F", false},
		{"escaped fragment", "https://example.com/#%61", "https://example.com/#a", false},
		{"escaped query", "https://example.com/?q=%20", "https://example.com/?q=+", false},
		{"identical escapes", "https://example.com/%2f?q=%61#%62", "https://EXAMPLE.com:443/%2f?q=%61#%62", true},
		// Raw API input is not WHATWG reserialized: callers pass webURL(value), as save does.
		{"raw dot segments", "https://example.com/b", "https://example.com/a/../b", false},
		{"WHATWG serialized save and lookup", "https://example.com/b", "https://example.com/b", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			record := saveItem(t, app, tc.stored, false)
			defer app.Delete(record)
			items := lookup(t, mux, owner, tc.input)
			want := 0
			if tc.match {
				want = 1
			}
			if len(items) != want {
				t.Fatalf("got %d matches, want %d: %+v", len(items), want, items)
			}
			if want == 1 && items[0]["id"] != record.Id {
				t.Fatal("wrong match")
			}
		})
	}
}

func TestAPIRejectsMalformedInput(t *testing.T) {
	mux, tokens, _ := apiFixture(t)
	for _, body := range []string{
		`{`, `null`, `{}`, `{"url":null}`, `{"url":123}`, `{"url":""}`, `{"url":"   "}`,
		`{"url":"https://example.com/","extra":true}`, `{"url":"https://example.com/"} {}`,
		`{"url":"file:///etc/passwd"}`, `{"url":"/relative"}`, `{"url":"https://user:pass@example.com/"}`,
		`{"url":"https:///path"}`, `{"url":"https://example.com:99999/"}`, `{"url":"https://example.com/%zz"}`,
		`{"url":"https://example.com/a b"}`, `{"url":"https://example.com\\evil"}`,
		`{"url":"https://example.com/` + strings.Repeat("a", 8192) + `"}`,
		`{"url":"https://example.com/"}` + strings.Repeat(" ", 65536),
	} {
		res := request(mux, tokens["likes_owners/likesowner00001"], body)
		if res.Code != http.StatusBadRequest {
			t.Fatalf("invalid input got %d: %s", res.Code, res.Body.String())
		}
	}
}

func TestAPIScansAllPagesWithoutTruncatingMatchesOrFetching(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	mux, tokens, app := apiFixture(t)
	collection, err := app.FindCollectionByNameOrId("likes_items")
	if err != nil {
		t.Fatal(err)
	}
	expected := map[string]bool{}
	for i := 0; i < 425; i++ {
		record := core.NewRecord(collection)
		record.Id = fmt.Sprintf("item%011d", i)
		record.Set("url", server.URL)
		record.Set("published", i%2 == 0)
		if i%5 == 0 {
			record.Set("url", server.URL+"/different")
		} else {
			expected[record.Id] = true
		}
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
	}
	// Invalid/absent legacy URLs must not prevent valid matches.
	saveItem(t, app, "", false)
	saveItem(t, app, "not a URL", false)
	items := lookup(t, mux, tokens["likes_owners/likesowner00001"], server.URL+"/")
	if len(items) != 340 {
		t.Fatalf("truncated matches: got %d, want 340", len(items))
	}
	for _, item := range items {
		id, _ := item["id"].(string)
		if !expected[id] {
			t.Fatalf("unexpected or repeated item: %+v", item)
		}
		delete(expected, id)
	}
	if len(expected) != 0 {
		t.Fatal("missing matches")
	}
	if calls.Load() != 0 {
		t.Fatal("lookup fetched a URL")
	}
}

func TestAPIOwnerAuthorizationContract(t *testing.T) {
	mux, tokens, _ := apiFixture(t)
	for _, key := range []string{"", "_superusers/superuser000001", "likes_owners/notowner0000001", "other_owners/otherowner00001"} {
		for _, body := range []string{`{"url":"https://example.com/"}`, `{`} {
			res := request(mux, tokens[key], body)
			if res.Code != http.StatusForbidden {
				t.Fatalf("%q got %d: %s", key, res.Code, res.Body.String())
			}
			if strings.Contains(res.Body.String(), "items") {
				t.Fatal("unauthorized response exposed items")
			}
			if res.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("response may be cached")
			}
		}
	}
	res := request(mux, tokens["likes_owners/likesowner00001"], `{"url":"https://example.com/"}`)
	if res.Code != http.StatusOK {
		t.Fatalf("owner got %d: %s", res.Code, res.Body.String())
	}
	var result map[string]json.RawMessage
	if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result) != 1 || string(result["items"]) != "[]" {
		t.Fatalf("wrong empty contract: %s", res.Body.String())
	}
	if res.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("response may be cached")
	}
}
