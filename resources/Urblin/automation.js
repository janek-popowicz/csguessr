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

const output = new XMLSerializer().serializeToString(doc);
fs.writeFileSync('output.osm', output, 'utf8');
