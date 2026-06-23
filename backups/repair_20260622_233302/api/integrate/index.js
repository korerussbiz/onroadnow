const { exec } = require('child_process');
module.exports = async (req, res) => {
  if (req.headers['x-integration-key'] !== process.env.INTEGRATION_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  exec('~/run_integration.sh', (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: err.message, stderr });
    res.status(200).json({ message: 'Integration started', output: stdout });
  });
};
