# MLS Plus - DLSU Course Offerings API

A Node.js application that provides an API to fetch and search course offerings from DLSU's enrollment system with MongoDB caching support.

## Features

- Real-time course offering searches from DLSU's enrollment system
- MongoDB caching for faster repeated queries
- Automated cookie management and browser automation with 10-minute refresh intervals
- Smart concurrent request handling with request queuing
- REST API endpoint for course searches
- Multi-day course schedule support
- Robust error handling and retry mechanisms
- Responsive web interface with advanced filtering options

## Prerequisites

- Node.js (v14 or higher)
- Python 3.x
- MongoDB
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone [your-repository-url]
cd mls-plus
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Set up Python virtual environment and dependencies:
```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
pip install -r requirements.txt
```

4. Create a `.env` file in the project root:
```
MONGODB_URI=your_mongodb_connection_string
PORT=3000 # Optional, defaults to 3000
```

## Usage

1. Start the server:
```bash
npm start
```

2. Access the API:
- Web Interface: `http://localhost:3000`
- API Endpoint: `http://localhost:3000/api/search?course=COURSECODE`

Example API call:
```bash
curl "http://localhost:3000/api/search?course=CSADPRG"
```

## API Reference

### GET /api/search

Fetches course offerings for a specific course code.

**Query Parameters:**
- `course` (required): The course code to search for (e.g., CSADPRG)

**Response Format:**
```json
{
    "courseCode": "CSADPRG",
    "sections": [
        {
            "classNbr": "2345",
            "section": "S11",
            "days": ["M", "H"],
            "times": ["915-1045"],
            "rooms": ["GK210"],
            "enrlCap": "45",
            "enrolled": "45",
            "remarks": "",
            "professor": "SANTOS, JUAN",
            "isOpen": true
        }
    ],
    "lastUpdated": "2025-04-22T10:30:00.000Z"
}
```

## Architecture

- **Node.js Backend**: Express.js server handling API requests
- **Python Script**: Handles browser automation for cookie management
- **MongoDB**: Caches course data for improved performance
- **Cheerio**: Parses HTML responses from DLSU's enrollment system

## Key Features

### Cookie Management
- Automatic refresh every 10 minutes
- Smart concurrent request handling
- Request queuing to prevent multiple browser instances
- Fallback to cached cookies when possible

### Error Handling

The application includes comprehensive error handling for:
- Invalid course codes
- Network failures
- Database connection issues
- Cookie expiration and refresh failures
- Rate limiting
- Invalid responses

### Caching and Performance
- MongoDB-based caching system
- Efficient request queuing
- Request deduplication
- Browser instance reuse

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- DLSU ITS
- Google Developer Group on Campus - DLSU

## Troubleshooting

### Common Issues

1. **MongoDB Connection Errors**
   - Verify MongoDB is running
   - Check connection string in `.env`
   - Ensure network connectivity

2. **Python Script Issues**
   - Verify Python virtual environment is activated
   - Check all dependencies are installed
   - Ensure proper permissions for browser automation

3. **Cookie Management Issues**
   - Check if browser automation is working
   - Verify network connectivity to DLSU servers
   - Monitor cookie refresh logs
   - Check for rate limiting or IP blocks

4. **API Response Issues**
   - Check course code format
   - Verify server is running
   - Monitor console for error messages
   - Check request queuing status

For additional support, please open an issue on the repository.