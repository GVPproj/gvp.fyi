package preview

import (
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const RequestsPerMinute = 6
const MaxConcurrent = 2

// API owns process-local admission limits for the one authorized owner. Reuse
// one instance for the app; unauthorized requests never consume owner capacity.
type API struct {
	fetcher  *Fetcher
	mu       sync.Mutex
	window   time.Time
	requests int
	active   chan struct{}
}

func NewAPI(f *Fetcher) *API { return &API{fetcher: f, active: make(chan struct{}, MaxConcurrent)} }
func (a *API) Register(app core.App) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.POST("/api/likes/preview", a.Handle)
		return e.Next()
	})
}
func (a *API) Handle(e *core.RequestEvent) error {
	e.Response.Header().Set("Cache-Control", "no-store")
	if e.Auth == nil || e.Auth.Collection().Name != "likes_owners" || e.Auth.Id != "likesowner00001" {
		return e.JSON(http.StatusForbidden, map[string]string{"message": "Owner access required."})
	}
	a.mu.Lock()
	now := time.Now()
	if now.Sub(a.window) >= time.Minute {
		a.window = now
		a.requests = 0
	}
	admitted := a.requests < RequestsPerMinute
	if admitted {
		a.requests++
	}
	a.mu.Unlock()
	if !admitted {
		return e.JSON(http.StatusTooManyRequests, map[string]string{"message": "Preview limit reached. Try again later."})
	}
	select {
	case a.active <- struct{}{}:
		defer func() { <-a.active }()
	default:
		return e.JSON(http.StatusTooManyRequests, map[string]string{"message": "Preview is busy. Try again later."})
	}
	var body struct {
		URL string `json:"url"`
	}
	e.Request.Body = http.MaxBytesReader(e.Response, e.Request.Body, 8192)
	decoder := json.NewDecoder(e.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"message": "Provide a public HTTP(S) URL."})
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return e.JSON(http.StatusBadRequest, map[string]string{"message": "Provide a public HTTP(S) URL."})
	}
	if _, err := validURL(body.URL); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"message": "Provide a public HTTP(S) URL."})
	}
	result, err := a.fetcher.Fetch(e.Request.Context(), body.URL)
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]string{"message": ErrFetch.Error()})
	}
	return e.JSON(http.StatusOK, result)
}
