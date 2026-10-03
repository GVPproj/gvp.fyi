// Package duplicates provides an owner-only, read-only repeated URL lookup.
package duplicates

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func Register(app core.App) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.POST("/api/likes/duplicates", handle)
		return e.Next()
	})
}

// comparisonKey deliberately does not reserialize net/url's decoded path or
// fragment. The original suffix preserves escapes, delimiters and query order.
// Callers using webURL must pass the same WHATWG-serialized URL they save.
func comparisonKey(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	invalid := fmt.Errorf("invalid web URL")
	if raw == "" || len(raw) > 8192 || strings.Contains(raw, "\\") || strings.IndexFunc(raw, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }) >= 0 {
		return "", invalid
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.Opaque != "" {
		return "", invalid
	}
	host := strings.ToLower(u.Host)
	if strings.HasSuffix(host, ":") {
		return "", invalid
	}
	if port := u.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 0 || n > 65535 {
			return "", invalid
		}
		if (u.Scheme == "http" && n == 80) || (u.Scheme == "https" && n == 443) {
			host = strings.TrimSuffix(host, ":"+port)
		}
	}
	start := strings.Index(raw, "://")
	if start < 0 {
		return "", invalid
	}
	suffix := raw[start+3:]
	if i := strings.IndexAny(suffix, "/?#"); i >= 0 {
		suffix = suffix[i:]
	} else {
		suffix = ""
	}
	if !strings.HasPrefix(suffix, "/") {
		suffix = "/" + suffix
	}
	return u.Scheme + "://" + host + suffix, nil
}

func handle(e *core.RequestEvent) error {
	e.Response.Header().Set("Cache-Control", "no-store")
	if e.Auth == nil || e.Auth.Collection().Name != "likes_owners" || e.Auth.Id != "likesowner00001" {
		return e.JSON(http.StatusForbidden, map[string]string{"message": "Owner access required."})
	}
	var body struct {
		URL string `json:"url"`
	}
	e.Request.Body = http.MaxBytesReader(e.Response, e.Request.Body, 64*1024)
	decoder := json.NewDecoder(e.Request.Body)
	decoder.DisallowUnknownFields()
	badRequest := func() error {
		return e.JSON(http.StatusBadRequest, map[string]string{"message": "Provide an HTTP(S) URL without credentials."})
	}
	if err := decoder.Decode(&body); err != nil {
		return badRequest()
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return badRequest()
	}
	key, err := comparisonKey(body.URL)
	if err != nil {
		return badRequest()
	}

	// Keyset-page the whole collection, including drafts and every item type.
	// Database reads are bounded, but the complete match set is returned.
	items := []*core.Record{}
	after := ""
	const pageSize = 200
	for {
		if err := e.Request.Context().Err(); err != nil {
			return err
		}
		records, err := e.App.FindRecordsByFilter("likes_items", "id > {:after}", "id", pageSize, 0, dbx.Params{"after": after})
		if err != nil {
			return e.InternalServerError("Unable to look up repeated URLs.", err)
		}
		for _, record := range records {
			storedKey, err := comparisonKey(record.GetString("url"))
			if err == nil && storedKey == key {
				items = append(items, record)
			}
		}
		if len(records) < pageSize {
			break
		}
		after = records[len(records)-1].Id
	}
	return e.JSON(http.StatusOK, map[string]any{"items": items})
}
