const express = require('express');
const app = express();
const PORT = 3000;

// Simple home route
app.get('/', (req, res) => {
  res.send('Hello from GoSnaggit!');
});

app.listen(PORT, () => {
  console.log(`GoSnaggit server running at http://localhost:${PORT}`);
});
