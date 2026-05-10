const fs = require('fs');
let file = fs.readFileSync('/home/kl/microservices-platform/training-peaks-service/services/intelligentWorkoutParser.js', 'utf8');
file = file.replace(/response_format:\s*{\s*type:\s*'json_object'\s*},/g, '');
fs.writeFileSync('/home/kl/microservices-platform/training-peaks-service/services/intelligentWorkoutParser.js', file);
