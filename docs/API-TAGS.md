# Tags API contract

How a note's tags are read and written. Settled 2026-09-10, after four different
tag failures were found live (see "Why this exists" at the bottom).

On a phone? The same content is mirrored to harrisnotes.ca note 82.

## The model

A tag has an id and a name. A note references tags **by id, always**. Names are
used in exactly one place — creating or renaming a *tag* — and are trimmed and
lower-cased there.

## Reading

```
GET /api/tags          every tag for the user, with note_count
GET /api/notes/:id     the note, including its tags
```

## Creating a note with tags

```
POST /api/notes
{"title": "...", "content": "...", "tags": [6, 1]}
```

`tags` is optional; ids must be positive integers the user owns (deduplicated).

## Editing tags on an existing note

One tag per request. There is no "here is the new list" operation:

```
PUT    /api/notes/:id/tags/:tagId      attach
DELETE /api/notes/:id/tags/:tagId      detach
```

**Why operations rather than a whole list:** a full-list write is a
read-modify-write, so a client holding a stale list silently drops tags another
device just added. Operations are also naturally idempotent — attaching twice
changes nothing, detaching something absent is a no-op — which makes them safe to
retry on a flaky connection.

**Why the id is in the path:** RFC 9110 §9.3.5 gives content in a `DELETE` no
generally defined semantics and notes it "might lead some implementations to
reject the request and close the connection because of its potential as a request
smuggling attack". So the detach request carries no body.

Both endpoints return the note's full tag list, so a client re-renders from the
server's answer instead of guessing:

```json
{"success": true, "data": {"id": 42, "tags": [{"id": 6, "name": "c++", "color": "#2b6e63"}]}}
```

## Errors

| Situation | Answer |
|---|---|
| `tags` present but not an array of positive integers | 400 `tags must be an array of tag ids` |
| An id the user does not own, on attach or create | 400 `unknown tag id N` |
| Unknown note, or a note that is not yours | 404 `Note not found` |
| Attaching a tag that is already attached | 200, no-op — on purpose |
| Detaching a tag that is not attached | 200, no-op — on purpose |

An id belonging to another user is reported exactly like one that does not exist,
so the API is not an oracle for other users' tag ids.

## Tag names

`POST /api/tags` and `PUT /api/tags/:id` trim and lower-case the name, so `CPP`,
`cpp`, and ` cpp ` are one tag rather than three. Length is capped at 100
characters (checked in the handler, so an over-long name is a 400 rather than a
500 from the column limit).

## Effects of a tag edit

Tag edits do **not** touch `notes.updated_at`. They are metadata, "modified"
means content, and an open editor's optimistic lock must not be tripped by a tag
tap. Both endpoints broadcast `note-updated`, so the user's other tabs refresh.

## Client side

One tag per tap, optimistic, reverted with an error toast if the request fails:
`public/utils/tag-endpoint.js`, `NotesApp.setNoteTag()`, the editor's
`toggleTag()`. Tag taps do not go through the content sync manager, and they do
not mark the editor dirty (a saved tap must never show "unsaved").

## Why this exists

Before 2026-09-10 the same wrong input got four different answers:

| Request | Was | Now |
|---|---|---|
| `POST /api/notes` `tags: ["c++"]` | 500 + a raw Postgres error | 400 |
| `POST /api/notes` `tags: "c++"` | 201, note saved with no tags, no warning | 400 |
| `PUT /api/notes/:id` `tags: "c++"` | **200, every tag silently wiped** | 400 |
| `PUT /api/notes/:id` `tags: [999]` | 200, silently ignored | 400 |

## Enforced since client version 26

`PUT /api/notes/:id` **refuses** a `tags` field outright:

```
400 {"success": false, "error": "tags is not accepted here - use PUT or DELETE /api/notes/:id/tags/:tagId"}
```

That includes `tags: []` — an empty list is still a tags field. The refusal was
staged: the field was accepted (but validated) while a deployed client might
still send one, and the client stopped sending it in version 25. From version 26
the contract is closed — a note's tags are written **only** as per-tag
operations, or as an id array when the note is created.

**Parked** (see the Parked Proposals note for the criteria): a database-level
`CHECK (name = lower(btrim(name)))` backstop on `tags`, so a write that bypasses
the API cannot create `CPP` alongside `cpp`. The API already normalizes; this
would make the invariant structural.
