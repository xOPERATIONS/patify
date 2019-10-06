'use strict';

if (!process.argv[2]) {
	console.error('You must pass a valid file path into this script');
	process.exit(1);
}

const fs = require('fs');
const path = require('path');


const htmlFile = path.join(process.cwd(), process.argv[2]);
const basename = path.basename(htmlFile, path.extname(htmlFile));
const dirname = path.dirname(htmlFile);
console.log(dirname);

if (!['.html', '.htm'].includes(path.extname(htmlFile))) {
	console.error(`${htmlFile} does not appear to be an HTML file`);
	process.exit(1);
}

if (!fs.existsSync(htmlFile)) {
	console.error(`${htmlFile} is not a valid file`);
	process.exit(1);
}

const cheerio = require('cheerio');
try {
	console.log("Loading HTML");
	var $ = cheerio.load(fs.readFileSync(process.argv[2]));
	console.log("HTML loaded");
} catch (err) {
	throw new Error(err);
}

const tasks = [];
let wasCheckboxList = false;

const taskHeader = `roles:

  - name: crewA
    description: TBD
    duration:
      minutes: 30

  - name: crewB
    description: TBD
    duration:
      minutes: 30

steps:
`;

$("body > div > div > table").each((t,table) => {

	let taskText = '';

	$(table).children("tbody").children("tr").each((r,row) => {
		let rowText = '';

		$(row).children("td").each((c,col) => {
			let cellText = '';

			$(col).children('p').each((p,para) => {
				let paraElem = $(para);

				let step = paraElem.text()
					.replace('&nbsp;', ' ')
					.replace('\n', ' ')
					.replace(/\s+/g, ' ')
					.replace('EV1', '{{role:crewA}}')
					.replace('EV2', '{{role:crewB}}')
					.replace('�', '')
					.replace('�', '')
					.replace('�', '')
					.replace('�', '')
					.replace('� ', '...')
					// .replace('�', '') <-- false ellipsis (...)
					// .replace('�', '')
					// .replace('�', '')
					// .replace('���', '')

					.replace('”', '"')
					.trim()
					.replace(/^\d+\. /,'')
					.trim();

				let isCheckboxList = step.indexOf("q ") === 0 || step.indexOf("qq") === 0;

				if (step) {
					if (isCheckboxList) {
						step = step.slice(2);
						if (!wasCheckboxList) {
							cellText += `          checkboxes:\n`;
						}
						cellText += `            - "${step}"\n`;
						wasCheckboxList = true;
					} else {
						cellText += `        - step: "${step}"\n`;
						wasCheckboxList = false;
					}
				}
			});

			if (cellText) {

				if (c === 0) {
					rowText += '      IV:\n';
				} else if (c === 1) {
					rowText += '      crewA:\n';
				} else if (c === 2) {
					rowText += '      crewB:\n';
				} else {
					console.error('bad column');
					console.error(cellText)
				}

				rowText += cellText
				rowText += '\n';
			}
		});

		if (rowText) {
			taskText += '  - simo:\n\n';
			taskText += rowText + '\n';
		}

	});

	if (taskText) {
		tasks[t] = `title: "Task ${t}"\n\n${taskHeader}\n${taskText}`;
	}

});

var procedure = `procedure_name: ${basename}

columns:

  - key: IV
    display: IV/SSRMS/MCC
    actors: "*"

  - key: EV1
    actors: EV1
    display: EV1

  - key: EV2
    actors: EV2
    display: EV2


tasks:
`;


const tasksDir = path.join(dirname, 'tasks');
const procsDir = path.join(dirname, 'procedures');

if (!fs.existsSync(tasksDir)) {
	fs.mkdirSync(tasksDir);
}
if (!fs.existsSync(procsDir)) {
	fs.mkdirSync(procsDir);
}

for (let t = 0; t < tasks.length; t++) {
	if (!tasks[t]) {
		continue;
	}

	const taskFileName = `${basename}-task-${t}.yml`
	const taskFilePath = path.join(tasksDir, taskFileName);
	fs.writeFileSync(taskFilePath, tasks[t]);
	procedure += `
  - file: ${taskFileName}
    roles:
      crewA: EV1
      crewB: EV2
    color: "#F5B041"
`;

}

fs.writeFileSync(path.join(procsDir, `${basename}.yml`), procedure);
console.log("complete!");





