const fs = require('fs');

let data = JSON.parse(fs.readFileSync('workflows/subworkflow-paginacion.json', 'utf8'));

const codeNode = data.nodes.find(n => n.name === '2.CodeTiendas_Sub');
if (codeNode) {
    codeNode.parameters.jsCode = `const items = $input.all();
if (items.length > 0 && items[0].json.centers && Array.isArray(items[0].json.centers)) {
  return items[0].json.centers.map(center => ({ json: { center_code: center, shop_name: "DYNAMIC_" + center } }));
}

// Fallback to old behavior just in case
return [
  { json: { center_code: "4735200001", shop_name: "SNAPPYS" } },
  { json: { center_code: "4735200002", shop_name: "SNAPPYBLUEIMPER AMZ" } },
  { json: { center_code: "4735200003", shop_name: "LEROY MERLIN" } },
  { json: { center_code: "4735200004", shop_name: "AMARTO SL" } },
  { json: { center_code: "4735200005", shop_name: "AMARTO AMZ" } }
];`;
}

fs.writeFileSync('workflows/subworkflow-paginacion.json', JSON.stringify(data, null, 2), 'utf8');
console.log("Subworkflow patched successfully.");
