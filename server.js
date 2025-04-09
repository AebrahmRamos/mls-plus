const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs').promises;
const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON request bodies
app.use(express.json());

// API endpoint to fetch course offerings
app.get('/api/proxy', async (req, res) => {
    try {
        const courseCode = req.query.course;
        
        if (!courseCode) {
            return res.status(400).json({ error: 'Course code is required' });
        }
        
        // DLSU cookie - You would need to update this periodically as it expires
        const cookie = 'cf_clearance=UnjlwB17Dtytamd_JRrs2spsxtZBisI5vainE0uoz2g-1744100151-1.2.1.1-fcHbZGsEx7bFXncm2VwzCzveu_sr76Gml5jK7M4xRsZcqknzHckIUg14pJkRY2bWI.TP_gT68kIcrMxst4jC5D02gUWFDS_P.eGu1xRREZSCEUUGX22TAMszbv1ohm6HhNq3j4QZ3K4ZsFIqZDWl9S9Dfg0ddKb2MEeslQVKl8_jLwEAre0GAxX.RrAyUsnorpGXj8lm_jvZ17J6h8s7Q.TuFrXyE8bH5tPEs8o2kuYs7xRM0uQCT88iKK380gaL1qgxwmALvmZn0SfVYihym33momxRKF5IN_3ufhgUk5oqTqC3OfbZvczhIH9iPJ89CQQL8__KxWJTcIt30RDz3WAwXbFtYmssm8N7dLMaVMnBMf4sBWPNSoSCrs8n6CR1; _ga_QECZBTZYC9=GS1.1.1744094728.1.0.1744094728.60.0.0; _ga=GA1.1.2091912286.1744094729; NSC_Fospmm_TTM=ffffffffc3a017b045525d5f4f58455e445a4a423660';
        
        // Make request to DLSU enrollment system
        const response = await axios({
            method: 'POST',
            url: 'https://enroll.dlsu.edu.ph/dlsu/view_course_offerings',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://enroll.dlsu.edu.ph',
                'Connection': 'keep-alive',
                'Referer': 'https://enroll.dlsu.edu.ph/dlsu/view_course_offerings',
                'Cookie': cookie,
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Priority': 'u=0, i',
                'TE': 'trailers'
            },
            data: `p_course_code=${courseCode}&p_option=all&p_button=Search&p_id_no=12216496&p_button=Submit`
        });
        
        // Extract data from HTML response
        const htmlContent = response.data;
        const sections = extractCourseSections(htmlContent, courseCode);
        
        if (sections.length === 0) {
            return res.json({ noResults: true });
        }
        
        return res.json({
            courseCode: courseCode,
            sections: sections
        });
        
    } catch (error) {
        console.error('Error fetching course offerings:', error);
        return res.status(500).json({ error: 'Failed to fetch course offerings' });
    }
});

// Function to extract course sections from HTML
function extractCourseSections(html, courseCode) {
    const $ = cheerio.load(html);
    const sections = [];
    let currentSection = null;
    let rowCount = 0;
    
    // Find the form with the course offerings table
    $('form[action="view_course_offerings"]').first().find('table').first().find('tr').each((i, elem) => {
        // Skip header row
        if (i === 0) return;
        
        const cells = $(elem).find('td');
        
        // Check if this is a section row (has class number)
        if (cells.eq(0).text().trim() !== '') {
            // If we have an existing section, add it to sections array
            if (currentSection) {
                sections.push(currentSection);
            }
            
            // Start a new section
            const classNbr = cells.eq(0).text().trim();
            const course = cells.eq(1).text().trim();
            const section = cells.eq(2).text().trim();
            const day = cells.eq(3).text().trim();
            const time = cells.eq(4).text().trim();
            const room = cells.eq(5).text().trim();
            const enrlCap = cells.eq(6).text().trim();
            const enrolled = cells.eq(7).text().trim();
            const remarks = cells.eq(8).text().trim();
            
            // Check if section is open or closed
            const isOpen = cells.eq(1).find('font[color="#006600"]').length > 0;
            
            currentSection = {
                classNbr,
                course,
                section,
                days: [day],
                times: [time],
                rooms: [room],
                enrlCap,
                enrolled,
                remarks,
                isOpen
            };
            
            rowCount = 0;
        }
        // Check if this is a professor row
        else if ($(elem).attr('1') && currentSection && rowCount === 0) {
            const professor = $(elem).find('td').text().trim();
            currentSection.professor = professor;
            rowCount++;
        }
        // Check if this is an additional schedule row
        else if (cells.length > 5 && currentSection && cells.eq(3).text().trim() !== '') {
            const day = cells.eq(3).text().trim();
            const time = cells.eq(4).text().trim();
            const room = cells.eq(5).text().trim();
            
            currentSection.days.push(day);
            currentSection.times.push(time);
            currentSection.rooms.push(room);
            
            rowCount++;
        }
    });
    
    // Add the last section if it exists
    if (currentSection) {
        sections.push(currentSection);
    }
    
    return sections;
}

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});