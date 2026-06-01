import fs from "fs";

const workflow = JSON.parse(fs.readFileSync("../workflows/main.json", "utf8"));
const nodes = workflow.nodes || [];

const target = nodes.find(n => n.name === "Code: Extraer Historial");
if (target) {
  console.log("Found Node:", target.name);
  console.log("JS Code:\n", target.parameters.jsCode);
} else {
  console.log("Node 'Code: Extraer Historial' not found!");
}
process.exit(0);
