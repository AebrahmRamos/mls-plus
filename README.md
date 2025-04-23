# MLS Plus - Better DLSU Course Offerings View

# NOTE!!!!: Properly working sa mac, haven't tried sa windows yet pero it should work the same. Just need to tweak a few things at most.
You can run yung selenium ng naka headless (selenium is pang kuha lang nung cookies d siya yung nag fefetch ng data) if gumagana sainyo pero based on my experience mas na by-bypass cloudflare if headed mode (which is yung default

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

## Environment Variables Setup

To configure the application, you need to create a `.env` file in the root directory of the project. This file will store sensitive information such as database connection strings and server configurations. Below is an example of the `.env` file:

```
COOKIE="cf_clearance=NDXUwc79U8Ot_dnLId8N_ctVrbh59OkCOUgee.UigRE-1745371969-1.2.1.1-HUt.GklHL9wkuHKFGtNmzIx2h3etQVhgJ7_njq5o3ePvgEgwWsYRyLp5Fp_ZHPQTfJkehlWBwqGIDRAuCbWOUDfWdXX8tDeEZDtUuS5380NesntOWfPRpvf18vuIO3EyoezcxF_hKk.JKYQ0De1WWlBtU7b_JgMLEPjvsUdeZXukzNQmNzhXEKDfjZZoOh2Jr1_gRSxQ1msSbNUyM4ksFF1ZvOxuwnoN8I_oDNb9czFoAJFREqbTG828yJvbf1L8G2fbEqyB8mft5pJxQxVdmQSdXnttRBQMLnPXoe3uS.iObDQpuP5LCHeZeEAyn9Q5zysBy3bEOZrKZD7bbjpD6OJT3ohIpo7k8HrBGSZu8n2vRNHpzeKCTwKfAOp5I2b2; NSC_Fospmm_TTM=ffffffffc3a017b045525d5f4f58455e445a4a423660; DLSU1=12275735; DLSU2=201666; DLSU3=; DLSU4=STU; DLSU5=; DLSU6=April     17, 2025 10:44:34 PM; DLSU8=; DLSU9=VIEW_CURRICULUM_AUDIT; DLSU10=; DLSU11=04/21/25 1227; DLSU12=; DLSU13=Y; DLSU14="
NODE_EN="development"
PORT=3000
MONGODB_URI=URI HERE
```

- Replace `your_mongodb_connection_string` with the connection string for your MongoDB instance.
- The `PORT` variable is optional and defaults to `3000` if not specified.
- Keep or replace 'cookie' kayo bahala. From MLS, nakukuha siya from network tab ng developer options/inspect element, file: view_course_offering, headers, request headers, cookie, `copy value`

## MongoDB Setup Guide

1. **Install MongoDB**:
   - Follow the official MongoDB installation guide for your operating system: [MongoDB Installation Guide](https://www.mongodb.com/docs/manual/installation/).

2. **Start MongoDB**:
   - On macOS and Linux, you can start MongoDB using:
     ```bash
     brew services start mongodb-community
     ```
   - On Windows, use the MongoDB Compass or start the MongoDB service from the Services app.

3. **Create a Database**:
   - Open the MongoDB shell or Compass and create a new database for the project. For example:
     ```bash
     use mls_plus
     ```

4. **Set Up a Collection**:
   - Inside the `mls_plus` database, create a collection to store course data. For example:
     ```bash
     db.createCollection("courses")
     ```

5. **Verify Connection**:
   - Ensure that your MongoDB instance is running and accessible using the connection string provided in the `.env` file.

6. **Test the Application**:
   - Start the server and verify that the application can connect to MongoDB without errors.

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
