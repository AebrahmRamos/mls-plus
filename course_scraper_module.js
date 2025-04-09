const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');


const MAX_LINE_LENGTH = 1024;

function extractHtmlTable(inputFilename) {
  try {
    const data = fs.readFileSync(inputFilename, 'utf8');
    const lines = data.split('\n');
    let insideForm = false;
    let formClosed = 0;
    let tableFound = false;
    let output = '<html><head></head><body>';

    for (const line of lines) {
      if (line.includes('<FORM ACTION="view_course_offerings" METHOD="POST">')) {
        insideForm = true;
        formClosed = 0;
        output += line + '\n';
      } else if (line.includes('</FORM>')) {
        output += line + '\n';
        formClosed++;
        if (formClosed === 2) {
          insideForm = false;
        }
      } else if (insideForm) {
        if (line.includes('<TABLE ') || tableFound) {
          tableFound = true;
          output += line + '\n';
          if (line.includes('</TABLE>')) {
            tableFound = false;
          }
        }
      }
    }

    output += '</body></html>';
    console.log(output);
    return 0;
  } catch (err) {
    console.error(`Error processing file ${inputFilename}: ${err.message}`);
    return 1;
  }
}

function fetch(subject, cookie, outputFile) {
  const command = `curl 'https://enroll.dlsu.edu.ph/dlsu/view_course_offerings' --compressed -X POST -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate, br' -H 'Content-Type: application/x-www-form-urlencoded' -H 'Origin: https://enroll.dlsu.edu.ph' -H 'Connection: keep-alive' -H 'Referer: https://enroll.dlsu.edu.ph/dlsu/view_course_offerings' -H 'Cookie: ${cookie}' -H 'Upgrade-Insecure-Requests: 1' -H 'Sec-Fetch-Dest: document' -H 'Sec-Fetch-Mode: navigate' -H 'Sec-Fetch-Site: same-origin' -H 'Sec-Fetch-User: ?1' -H 'Priority: u=0, i' -H 'TE: trailers' --data-raw 'p_course_code=${subject}&p_option=all&p_button=Search&p_id_no=12216496&p_button=Submit' -o ${outputFile}`;

  try {
    execSync(command);

    if (!fs.existsSync(outputFile)) {
      console.error(`Error: File '${outputFile}' not found.`);
      return 0;
    }

    if (extractHtmlTable(outputFile) !== 0) {
      console.error('Error extracting HTML table');
      return 0;
    }

    return 1;
  } catch (err) {
    console.error(`Error executing curl command or processing file: ${err.message}`);
    return 0;
  }
}

// Export functions for use in other files
module.exports = {
  extractHtmlTable,
  fetch
};

// Only run main if this file is being executed directly
if (require.main === module) {
  const cookie = 'cf_clearance=t90ekyb44PYJ9i3enImv0SivEn9GRx3Y1cFXG58uhxM-1744114082-1.2.1.1-RBOeUMpQYLXu2UmWDqjWMIJb4TSIfFW.Bhh3PtVj_24ensQ3seAEAEueQ3oGRzDKzyhOZ9AvdHv00oLke0W0jw1q4UpvbtS1hFFO4JXyk_y.rXEPN6RuKKbziTP2vXg1a2dW4_RoboHxCRf9dxjtYkLZZfSlZQ0T0YPNudaaiqXwCZTS3qX9G69vRqKt_EOyW_0fOyq9JXMo9zqswDk1o6wJyuMc3VlCEKgaEYRkPFYCAaodvCdPpJU5kYHGUMoAVS8wjfevLjDOj4chEUBcYL6gSoeWJuS6MSv8nSPiD6yqH2_6cYWkGM0qTBhbaTarEtSWZyCJc87vLFJRMMhzWDi0LVO3FQtMuU84nkt6FNCulR2To1yVvAt4rwdDBMTW; NSC_Fospmm_TTM=ffffffffc3a017b345525d5f4f58455e445a4a422851';
  let outputFile = 'offering.html';

  const tmpDir = 'tmp';
  if (!fs.existsSync(tmpDir)) {
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      outputFile = path.join(tmpDir, 'offering.html');
    } catch (err) {
      console.error(`Error creating directory 'tmp': ${err.message}`);
    }
  }

  if (process.argv.length > 2) {
    const subject = process.argv[2];
    fetch(subject, cookie, outputFile);
    return;
  }

  try {
    const subjects = fs.readFileSync('subjects.txt', 'utf8').split('\n').filter(Boolean);

    for (const subject of subjects) {
      if (fetch(subject.trim(), cookie, outputFile) === 1) {
        console.log(`Subject ${subject.trim()} offered`);
      }
    }
  } catch (err) {
    console.error(`Error processing subjects file: ${err.message}`);
  }
}