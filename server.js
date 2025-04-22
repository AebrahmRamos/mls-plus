const express = require('express');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const { execSync } = require('child_process');
const { spawn } = require('child_process');
const app = express();
const port = process.env.PORT || 3000;

// Load environment variables
require('dotenv').config();

// MongoDB connection string
const mongoURI = process.env.MONGODB_URI;

// Connect to MongoDB
mongoose.connect(mongoURI, {})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON request bodies
app.use(express.json());

// Import the Course model
const Course = require('./models/course');

// State variables
let currentCookie = process.env.COOKIE;
let currentUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0';
let lastCookieRefresh = new Date();
let isRefreshingCookie = false; // Lock flag for cookie refresh
let cookieRefreshPromise = null; // Promise for ongoing refresh
let cookieRefreshQueue = []; // Queue for requests waiting for cookie refresh

const pythonPath = path.join(__dirname, '.venv', 'bin', 'python3');

// Constants for retry configurations
const CURL_MAX_RETRIES = 3;
const CURL_RETRY_DELAY = 2000; // 2 seconds
const COOKIE_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

async function getClearanceCookie(url) {
    // If there's an ongoing refresh, return its promise
    if (cookieRefreshPromise) {
        return cookieRefreshPromise;
    }

    // Set the lock
    isRefreshingCookie = true;

    // Create a new refresh promise
    cookieRefreshPromise = new Promise((resolve, reject) => {
        console.log(`Using Python interpreter: ${pythonPath}`);
        
        const python = spawn(pythonPath, ['main.py', '--headed', url]);
        
        let output = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
            const dataStr = data.toString();
            // console.log(`Python stdout: ${dataStr}`); // Log the raw output for debugging
            output += dataStr;
        });

        python.stderr.on('data', (data) => {
            const message = data.toString();
            errorOutput += message;
            if (!message.includes('[INFO]')) {
                console.error(`Python error: ${message}`);
            } else {
                console.log(`Python info: ${message}`);
            }
        });

        python.on('error', (error) => {
            console.error(`Failed to start Python process: ${error.message}`);
            reject(new Error(`Failed to start Python process: ${error.message}`));
        });

        python.on('close', async (code) => {
            try {
                console.log(`Python process exited with code ${code}`);
                
                const cookieMatch = output.match(/Cookie: ([^\n]*)/);
                const userAgentMatch = output.match(/User agent: ([^\n]*)/);

                if (cookieMatch && userAgentMatch) {
                    console.log('Successfully obtained new cookie and user agent');
                    resolve({
                        cookie: cookieMatch[1].trim(),
                        userAgent: userAgentMatch[1].trim()
                    });
                } else {
                    console.error('Failed to extract cookie or user agent from output');
                    reject(new Error('Failed to extract cookie or user agent from output'));
                }
            } catch (error) {
                console.error('Exception while processing Python output:', error);
                reject(error);
            } finally {
                // Clear the lock and promise
                isRefreshingCookie = false;
                cookieRefreshPromise = null;
                
                // Process queued requests
                while (cookieRefreshQueue.length > 0) {
                    const { resolve: queuedResolve } = cookieRefreshQueue.shift();
                    try {
                        const result = await getClearanceCookie(url);
                        queuedResolve(result);
                    } catch (error) {
                        // If we fail, continue to next queued request
                        console.error('Failed to process queued cookie refresh:', error);
                    }
                }
            }
        });
    });

    return cookieRefreshPromise;
}

async function performCurlRequest(courseCode, retryCount = 0) {
    // Check if cookie needs refresh
    const needsRefresh = !currentCookie || new Date() - lastCookieRefresh > COOKIE_REFRESH_INTERVAL;
    
    if (needsRefresh) {
        if (isRefreshingCookie) {
            // If already refreshing, queue this request
            await new Promise((resolve) => {
                cookieRefreshQueue.push({ resolve });
            });
        } else {
            try {
                const clearance = await getClearanceCookie('https://enroll.dlsu.edu.ph/dlsu/view_course_offerings');
                currentCookie = clearance.cookie;
                currentUserAgent = clearance.userAgent;
                lastCookieRefresh = new Date();
            } catch (error) {
                console.error('Failed to refresh cookie:', error);
                // Continue with existing cookie if refresh fails
            }
        }
    }

    const command = `curl 'https://enroll.dlsu.edu.ph/dlsu/view_course_offerings' --compressed -X POST \
                -H 'User-Agent: ${currentUserAgent}' \
                -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' \
                -H 'Accept-Language: en-US,en;q=0.5' \
                -H 'Accept-Encoding: gzip, deflate, br' \
                -H 'Content-Type: application/x-www-form-urlencoded' \
                -H 'Origin: https://enroll.dlsu.edu.ph' \
                -H 'Connection: keep-alive' \
                -H 'Referer: https://enroll.dlsu.edu.ph/dlsu/view_course_offerings' \
                -H 'Cookie: ${currentCookie}' \
                -H 'Upgrade-Insecure-Requests: 1' \
                -H 'Sec-Fetch-Dest: document' \
                -H 'Sec-Fetch-Mode: navigate' \
                -H 'Sec-Fetch-Site: same-origin' \
                -H 'Sec-Fetch-User: ?1' \
                -H 'Priority: u=0, i' \
                -H 'TE: trailers' \
                --data-raw 'p_course_code=${encodeURIComponent(courseCode)}&p_option=all&p_button=Search&p_id_no=12216496&p_button=Submit' \
                --silent --max-time 10`;

    try {
        const htmlContent = execSync(command, { encoding: 'utf8', timeout: 10000 });

        const needsNewCookie = 
            htmlContent.includes('403 Forbidden') ||
            htmlContent.includes('check your browser') ||
            htmlContent.includes('Security check') ||
            htmlContent.includes('Please wait') ||
            htmlContent.length < 500 ||
            !htmlContent.includes('table');

        if (needsNewCookie && retryCount < CURL_MAX_RETRIES) {
            console.log(`Invalid response detected, attempting to get new cookie (attempt ${retryCount + 1}/${CURL_MAX_RETRIES})`);
            
            if (isRefreshingCookie) {
                // Wait for ongoing refresh
                await new Promise((resolve) => {
                    cookieRefreshQueue.push({ resolve });
                });
            } else {
                try {
                    const clearance = await getClearanceCookie('https://enroll.dlsu.edu.ph/dlsu/view_course_offerings');
                    currentCookie = clearance.cookie;
                    currentUserAgent = clearance.userAgent;
                    lastCookieRefresh = new Date();
                } catch (e) {
                    console.error('Failed to get new cookie:', e);
                }
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, CURL_RETRY_DELAY));
            return performCurlRequest(courseCode, retryCount + 1);
        }

        return htmlContent;
    } catch (error) {
        if (retryCount < CURL_MAX_RETRIES) {
            console.log(`Request failed, retrying (${retryCount + 1}/${CURL_MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, CURL_RETRY_DELAY));
            return performCurlRequest(courseCode, retryCount + 1);
        }
        throw error;
    }
}

// Function to parse HTML using cheerio
function parseHTML(html, courseCode) {
    const $ = cheerio.load(html);
    const sections = [];
    let currentSection = null;

    // Find all table rows
    $('table tr').each((index, row) => {
        const cells = $(row).find('td');

        // Skip header rows or invalid rows
        if (cells.length === 9) {
            // Check if this is a main section row (has a class number)
            const classNbr = $(cells[0]).find('b').text().trim();
            const sectionCode = $(cells[2]).find('b').text().trim();

            // Skip header row with column titles
            if ($(cells[6]).text().trim() === 'Enrl Cap') {
                return;
            }

            // If this row has a class number, it's a new main section
            if (classNbr) {
                // Save previous section if exists
                if (currentSection) {
                    sections.push(currentSection);
                }

                // Create new section
                currentSection = {
                    classNbr: classNbr,
                    course: courseCode,
                    section: sectionCode,
                    days: [$(cells[3]).text().trim()].filter(Boolean),
                    times: [$(cells[4]).text().trim()].filter(Boolean),
                    rooms: [$(cells[5]).text().trim()].filter(Boolean),
                    enrlCap: $(cells[6]).text().trim(),
                    enrolled: $(cells[7]).text().trim(),
                    remarks: $(cells[8]).text().trim(),
                    professor: '',
                    isOpen: $(cells[0]).attr('bgcolor') === '#D2EED3'
                };
            }
            // If this is a continuation row for a multi-day course
            else if (currentSection && !classNbr && !sectionCode) {
                const day = $(cells[3]).text().trim();
                const time = $(cells[4]).text().trim();
                const room = $(cells[5]).text().trim();

                // Only add non-empty values
                if (day && cells.eq(3).attr('bgcolor') === '#D2EED3') {
                    currentSection.days.push(day);
                }
                if (time && cells.eq(4).attr('bgcolor') === '#D2EED3') {
                    currentSection.times.push(time);
                }
                if (room && cells.eq(5).attr('bgcolor') === '#D2EED3') {
                    currentSection.rooms.push(room);
                }
            }
        }
        // Handle professor information row
        else if (cells.length > 0 && $(cells[0]).attr('colspan') === '6' && currentSection) {
            const professorText = $(cells[0]).text().trim();
            if (professorText && !currentSection.professor) {
                currentSection.professor = professorText;
            }
        }
    });

    // Add the last section if it exists
    if (currentSection) {
        sections.push(currentSection);
    }

    // Filter out any invalid entries (like header rows that might have slipped through)
    const validSections = sections.filter(section =>
        section.classNbr && section.section && section.days.length > 0
    );

    return { courseCode, sections: validSections };
}

// API endpoint to fetch course offerings using curl
app.get('/api/search', async (req, res) => {
    try {
        const courseCode = req.query.course?.toUpperCase().trim();

        if (!courseCode) {
            return res.status(400).json({ error: 'Course code is required' });
        }

        // Check if cookie needs refresh (every 30 minutes)
        if (!currentCookie || new Date() - lastCookieRefresh > 30 * 60 * 1000) {
            try {
                const clearance = await getClearanceCookie('https://enroll.dlsu.edu.ph/dlsu/view_course_offerings');
                currentCookie = clearance.cookie;
                currentUserAgent = clearance.userAgent;
                lastCookieRefresh = new Date();
            } catch (error) {
                console.error('Failed to refresh cookie:', error);
            }
        }

        const htmlContent = await performCurlRequest(courseCode);

        let courseDataFromDLSU = null;
        let fetchError = null;

        if (htmlContent) {
            // Add better validation of the HTML content
            if (htmlContent.length < 500 || !htmlContent.includes('table')) {
                console.log(`Invalid response received for ${courseCode}, length: ${htmlContent.length}`);
                throw new Error('Invalid response received');
            }

            const parsedData = parseHTML(htmlContent, courseCode);

            if (htmlContent.includes('No course sections found')) {
                console.log(`No sections found for ${courseCode} on DLSU site.`);
                courseDataFromDLSU = { courseCode, sections: [], noResults: true };
            } else if (parsedData && parsedData.sections && parsedData.sections.length > 0) {
                courseDataFromDLSU = parsedData;
            } else {
                console.log(`Potentially empty or invalid response for ${courseCode} from DLSU (curl).`);
                courseDataFromDLSU = null;
            }
        }

        // Fallback and DB logic
        if (courseDataFromDLSU && !courseDataFromDLSU.noResults) {
            const now = new Date();
            try {
                await Course.updateOne(
                    { courseCode: courseCode },
                    { $set: { sections: courseDataFromDLSU.sections, lastUpdated: now } },
                    { upsert: true }
                );
                console.log(`Course ${courseCode} data saved/updated in MongoDB`);
                return res.json({
                    courseCode: courseDataFromDLSU.courseCode,
                    sections: courseDataFromDLSU.sections,
                    lastUpdated: now
                });
            } catch (dbError) {
                console.error('Error saving to MongoDB:', dbError);
                return res.json({
                    courseCode: courseDataFromDLSU.courseCode,
                    sections: courseDataFromDLSU.sections,
                    lastUpdated: now
                });
            }
        }
        else if (courseDataFromDLSU && courseDataFromDLSU.noResults) {
            return res.json({ courseCode: courseCode, noResults: true });
        }
        else {
            console.log(`Attempting fallback to MongoDB for ${courseCode}`);
            try {
                const courseFromDB = await Course.findOne({ courseCode: courseCode });
                if (courseFromDB) {
                    console.log(`Course ${courseCode} data retrieved from MongoDB`);
                    return res.json({
                        courseCode: courseFromDB.courseCode,
                        sections: courseFromDB.sections,
                        lastUpdated: courseFromDB.lastUpdated
                    });
                } else {
                    console.log(`Course ${courseCode} not found in MongoDB either.`);
                    return res.json({ courseCode: courseCode, noResults: true });
                }
            } catch (dbError) {
                console.error('Error fetching from MongoDB:', dbError);
                return res.status(500).json({ error: 'Failed to fetch course data from MongoDB' });
            }
        }

    } catch (error) {
        console.error('Unexpected error in /api/search:', error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
});

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});