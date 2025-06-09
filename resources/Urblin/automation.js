const fs = require('fs');
const { DOMParser, XMLSerializer } = require('xmldom');

const input = fs.readFileSync('input.osm', 'utf8');
const doc = new DOMParser().parseFromString(input, 'application/xml');

const wayElements = Array.from(doc.getElementsByTagName('way'));
const seenTagSets = new Set();
let removed = 0;

for (const way of wayElements) {
  const tags = Array.from(way.getElementsByTagName('tag'));

  if (tags.length === 0) continue;

  const tagSignature = tags
    .map(tag => `${tag.getAttribute('k')}=${tag.getAttribute('v')}`)
    .sort()
    .join('|');

  if (seenTagSets.has(tagSignature)) {
    way.parentNode.removeChild(way);
    removed++;
  } else {
    seenTagSets.add(tagSignature);
  }
}

console.log(`Usunięto ${removed} zduplikowanych <way>`);

let output = new XMLSerializer().serializeToString(doc);
// Usuń puste linie i linie zawierające tylko białe znaki
output = output.split('\n').filter(line => line.trim()).join('\n');

fs.writeFileSync('output.osm', output, 'utf8');
