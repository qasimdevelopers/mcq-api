const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const QUESTIONS_PATH = './questions';
console.log('📂 Loading questions from:', path.resolve(QUESTIONS_PATH));

let allQuestions = [];

function loadAllQuestions() {
  if (!fs.existsSync(QUESTIONS_PATH)) {
    console.error('❌ Folder not found:', QUESTIONS_PATH);
    return;
  }

  let fileCount = 0;
  let questionCount = 0;

  function walkDir(dir) {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (item.endsWith('.json')) {
        fileCount++;
        try {
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          if (Array.isArray(data)) {
            // Get source from folder name
            const source = path.basename(path.dirname(fullPath));
            data.forEach(q => {
              q._source = q.source || source || 'Unknown';
              q._subject = (q.tags && q.tags[0]) || 'Untitled';
            });
            allQuestions = allQuestions.concat(data);
            questionCount += data.length;
            console.log(`  ✅ ${item} (${data.length} questions)`);
          }
        } catch(e) {
          console.error(`  ❌ Error loading ${item}:`, e.message);
        }
      }
    });
  }

  walkDir(QUESTIONS_PATH);
  console.log(`\n📊 Loaded ${fileCount} files, ${questionCount} total questions`);
}

loadAllQuestions();

// Build sources index
function buildSources() {
  const sources = {};
  allQuestions.forEach(q => {
    const src = q._source || 'Unknown';
    if (!sources[src]) sources[src] = new Set();
    const subject = q._subject || 'Untitled';
    sources[src].add(subject);
  });
  const result = {};
  Object.keys(sources).forEach(k => {
    result[k] = Array.from(sources[k]).sort();
  });
  return result;
}

const sourcesIndex = buildSources();

// API Routes
app.get('/api/sources', (req, res) => {
  res.json({ sources: sourcesIndex });
});

app.post('/api/questions', (req, res) => {
  const { source, subject, count = 20, shuffle = true } = req.body;
  
  let filtered = allQuestions.filter(q => {
    if (source && source !== 'ALL' && q._source !== source) return false;
    if (subject && subject !== 'ALL' && q._subject !== subject) return false;
    return true;
  });
  
  if (shuffle) {
    filtered = filtered.sort(() => Math.random() - 0.5);
  }
  
  const result = filtered.slice(0, Math.min(count, filtered.length));
  
  res.json({ 
    questions: result,
    total: filtered.length,
    returned: result.length
  });
});

// Get all subjects for a specific source
app.get('/api/subjects/:source', (req, res) => {
  const source = req.params.source;
  if (source === 'ALL') {
    const allSubjects = new Set();
    Object.values(sourcesIndex).forEach(subjects => {
      subjects.forEach(s => allSubjects.add(s));
    });
    res.json({ subjects: Array.from(allSubjects).sort() });
  } else if (sourcesIndex[source]) {
    res.json({ subjects: sourcesIndex[source] });
  } else {
    res.status(404).json({ error: 'Source not found' });
  }
});

// Get stats
app.get('/api/stats', (req, res) => {
  const totalQuestions = allQuestions.length;
  const totalSources = Object.keys(sourcesIndex).length;
  const totalSubjects = new Set();
  Object.values(sourcesIndex).forEach(subjects => {
    subjects.forEach(s => totalSubjects.add(s));
  });
  
  res.json({
    totalQuestions,
    totalSources,
    totalSubjects: totalSubjects.size,
    sources: Object.keys(sourcesIndex)
  });
});
// Add this to your server.js right after the other routes

// Get question counts per subject for a source
app.get('/api/subject-counts/:source', (req, res) => {
  const source = req.params.source;
  const counts = {};
  
  let questions = allQuestions;
  if (source !== 'ALL') {
    questions = questions.filter(q => q._source === source);
  }
  
  questions.forEach(q => {
    const subject = q._subject || 'Untitled';
    counts[subject] = (counts[subject] || 0) + 1;
  });
  
  // Sort by count descending
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .reduce((obj, [key, val]) => {
      obj[key] = val;
      return obj;
    }, {});
  
  res.json({ counts: sorted });
});

// Also add a stats endpoint that shows per-subject counts if needed
app.get('/api/stats/detailed', (req, res) => {
  const sourceStats = {};
  
  Object.keys(sourcesIndex).forEach(source => {
    const counts = {};
    const questions = allQuestions.filter(q => q._source === source);
    questions.forEach(q => {
      const subject = q._subject || 'Untitled';
      counts[subject] = (counts[subject] || 0) + 1;
    });
    sourceStats[source] = counts;
  });
  
  res.json({ sourceStats });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 API running on http://localhost:${PORT}`);
  console.log(`📚 Sources: ${Object.keys(sourcesIndex).join(', ') || 'None found'}`);
  console.log(`\n📋 Endpoints:`);
  console.log(`  GET  /api/sources - List all sources and their subjects`);
  console.log(`  GET  /api/stats - Get statistics`);
  console.log(`  GET  /api/subjects/:source - Get subjects for a source`);
  console.log(`  POST /api/questions - Get filtered questions`);
  console.log(`\n💡 Example: http://localhost:${PORT}/api/sources`);
});