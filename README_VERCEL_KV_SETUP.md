# Vercel KV Setup for Analytics

## Configuration

To use the analytics tracking with Vercel KV, you need to set up a KV database in your Vercel project:

1. Go to your Vercel dashboard
2. Navigate to the Storage tab
3. Create a new KV database
4. Connect it to your project

The connection will automatically add these environment variables:
- `KV_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`

## Local Development

You have three options for local testing:

### Option 1: Use Upstash Redis (Easiest)
1. Sign up for free at [upstash.com](https://upstash.com)
2. Create a Redis database (10,000 requests/day free)
3. Add credentials to `.env.local`:
```env
KV_REST_API_URL="https://your-instance.upstash.io"
KV_REST_API_TOKEN="your-token"
```

### Option 2: Local Redis Server
1. Install Redis locally:
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Windows (using WSL2 or Docker)
docker run -d -p 6379:6379 redis
```

2. The app will automatically use local Redis if no KV_REST_API_URL is set

### Option 3: Use Vercel KV Credentials
Get credentials from your Vercel dashboard and add to `.env.local`:
```env
KV_URL="redis://..."
KV_REST_API_URL="https://..."
KV_REST_API_TOKEN="..."
KV_REST_API_READ_ONLY_TOKEN="..."
```

## Data Structure

The analytics system tracks:
- **Search terms** with counters (`term:*`)
- **Individual search events** (`search:timestamp:visitorId`)
- **Daily statistics** (`daily:YYYY-MM-DD`)
- **Unique visitors** (`visitor:YYYY-MM-DD:visitorId`)
- **Recent searches list** (`recent:searches`)

## Features

- **Automatic deduplication**: Prevents tracking the same search within 5 seconds
- **Debouncing**: 800ms delay before tracking to avoid spam
- **Visitor tracking**: Persistent visitor ID stored in localStorage
- **Session tracking**: Session ID stored in sessionStorage
- **Data retention**: Events expire after 90 days automatically

## API Endpoints

### POST /api/analytics
Track a search event:
```json
{
  "searchTerm": "apple",
  "visitorId": "unique-visitor-id",
  "timestamp": 1234567890,
  "resultsCount": 5,
  "network": 42161,
  "sessionId": "session-id"
}
```

### GET /api/analytics
Retrieve analytics summary:
```json
{
  "totalSearches": 100,
  "uniqueVisitorsToday": 25,
  "topSearchTerms": [
    {"term": "apple", "count": 15},
    {"term": "microsoft", "count": 12}
  ],
  "searchesWithNoResults": 5,
  "recentSearches": [...],
  "dailyStats": [...]
}
```