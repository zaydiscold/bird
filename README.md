<p align="center">
  <a href="https://github.com/zaydiscold/bird-skill">
    <img src="https://img.shields.io/badge/bird-v0.8.0-D4AF37?style=flat-square&labelColor=1a1a2e" alt="v0.8.0" />
  </a>
  <img src="https://img.shields.io/badge/brew-steipete%2Ftap-B4A7D6?style=flat-square&labelColor=1a1a2e" alt="brew" />
  <img src="https://img.shields.io/badge/license-MIT-4A9D6F?style=flat-square&labelColor=1a1a2e" alt="MIT" />
</p>

<h1 align="center">bird</h1>

<p align="center">fast cli for twitter/x. by <a href="https://x.com/steipete">@steipete</a>. mirrored here so the tool stays accessible.</p>

---

> **note:** bird was built by [@steipete](https://x.com/steipete). the original github repo at [steipete/bird](https://github.com/steipete/bird) was removed from github. this is a community mirror maintained by [@zaydiscold](https://github.com/zaydiscold) so the tool stays accessible. all credit for the cli goes to @steipete.
>
> the homebrew tap (`steipete/tap`) still works and is the recommended install method.

---

## install

```bash
brew install steipete/tap/bird
```

verify:

```bash
bird whoami  # returns your twitter handle
```

no api keys, no oauth. bird reads cookies directly from safari (default) or chrome. requires being logged into x.com in your browser.

---

## auth

bird auto-detects safari cookies with no flags needed.

```bash
bird whoami                          # confirm logged-in account
bird check                           # check cookie availability
bird --chrome-profile "Default" ...  # use chrome instead of safari
```

---

## commands

### read

```bash
bird read <url-or-id>                # read a single tweet
bird thread <url-or-id>              # full conversation thread
bird thread <url-or-id> --all        # thread, all pages (paginated)
bird replies <url-or-id>             # replies to a tweet
bird user-tweets @handle -n 20       # user's recent tweets
```

### search

```bash
bird search "query" -n 20
bird search "from:@handle keyword" -n 10
bird search "term" --all             # paginate through all results
```

### timeline & discovery

```bash
bird home -n 20                      # for you feed
bird home --following -n 20          # following (chronological)
bird mentions -n 20                  # your mentions
bird mentions -u @handle -n 20       # another user's mentions
bird bookmarks -n 20                 # your bookmarks
bird likes -n 20                     # your liked tweets
bird news --ai-only                  # trending / ai-curated
bird news --with-tweets --tweets-per-item 3
bird lists                           # your lists
bird list-timeline <list-id-or-url>  # list timeline
bird about @handle                   # account origin & location
bird following -n 50                 # who you follow
bird followers -n 50                 # your followers
```

### post & engage

```bash
bird tweet "text here"
bird reply <url-or-id> "reply text"
bird follow @handle
bird unfollow @handle
bird unbookmark <url-or-id>

# media — up to 4 images or 1 video
bird tweet "caption" --media /path/to/image.jpg --alt "alt text"
bird tweet "caption" --media /path/to/video.mp4
```

### output formats

```bash
bird read <id> --json           # structured json
bird read <id> --json-full      # json + raw api response
bird search "query" --plain     # no color/emoji, pipeable
```

### flags

| flag | description |
|------|-------------|
| `-n <number>` | number of results to return |
| `--all` | paginate through all results |
| `--following` | filter to accounts you follow |
| `--ai-only` | ai-curated results (news command) |
| `--with-tweets` | include tweets in results |
| `--tweets-per-item <n>` | tweets per list item |
| `--chrome-profile "Name"` | use chrome profile instead of safari |
| `--json` | json output |
| `--json-full` | json output with raw api data |
| `--plain` | plain text, no color |
| `--media <path>` | attach media file |
| `--alt <text>` | alt text for media |

---

## use with ai agents

for using bird with claude code, codex, cursor, or other ai agents: **[zaydiscold/bird-skill](https://github.com/zaydiscold/bird-skill)**

paste an x.com link into any agent conversation and it reads it directly — no browser, no webfetch.

---

## formula

the homebrew formula is included in [`Formula/bird.rb`](./Formula/bird.rb) for reference.

---

## credits

bird was built by [@steipete](https://x.com/steipete) (Peter Steinberger). the original repo was removed from github. this mirror is maintained by [zayd](https://zayd.wtf) ([@zaydiscold](https://github.com/zaydiscold)) so the tool stays accessible to people who depend on it.

open tools should stay open.

---

<p align="center">
  <a href="https://zayd.wtf">zayd.wtf</a> · <a href="https://x.com/coldcooks">@coldcooks</a> · <a href="https://github.com/zaydiscold">github</a>
</p>
