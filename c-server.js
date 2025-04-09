const express = require('express');
const path = require('path');
const cheerio = require('cheerio');
const fs = require('fs');
require('dotenv').config();
// Import functions from course_scraper.js
const { fetch, extractHtmlTable } = require('./course_scraper_module');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

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

// Endpoint to search for course offerings
app.get('/api/search', async (req, res) => {
    try {
        const courseCode = req.query.course;

        if (!courseCode) {
            return res.status(400).json({ error: 'Course code is required' });
        }

        // Define the cookie and output file
        const cookie = process.env.COOKIE;
        
        const outputFile = path.join('tmp', 'offering.html');
        
        // Create tmp directory if it doesn't exist
        if (!fs.existsSync('tmp')) {
            fs.mkdirSync('tmp', { recursive: true });
        }

        // Use a promise to handle the fetch operation
        const fetchResult = await new Promise((resolve, reject) => {
            try {
                // Capture console.log output from extractHtmlTable
                const originalLog = console.log;
                let htmlOutput = '';
                
                console.log = (data) => {
                    htmlOutput += data;
                };
                
                // Call the fetch function from course_scraper.js
                const result = fetch(courseCode, cookie, outputFile);
                
                // Restore console.log
                console.log = originalLog;
                
                resolve({ success: result === 1, html: htmlOutput });
            } catch (error) {
                reject(error);
            }
        });

        if (!fetchResult.success) {
            return res.status(500).json({ error: 'Failed to fetch course data' });
        }

        // Parse the HTML
        const courseData = parseHTML(fetchResult.html, courseCode);
        console.log(courseData);
        return res.json(courseData);
    } catch (error) {
        console.error('Error handling request:', error);
        return res.status(500).json({ error: 'Server error' });
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