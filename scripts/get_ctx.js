const fs = require("fs"); const wf = JSON.parse(fs.readFileSync("../workflows/main.json")); const node = wf.nodes.find(n => n.name === "Code: Preparar Contexto"); console.log(node.parameters.jsCode);
