process.on('SIGTERM', () => {
  console.log('[stubborn] got SIGTERM, ignoring it once...');
});
setInterval(() => console.log('[stubborn] still running...'), 1000);
