#!/usr/bin/env node

'use strict';

if (!process.argv[2]) {
	console.error('You must pass a valid file path into this script');
	process.exit(1);
}

const fs = require('fs');
const path = require('path');


const htmlFile = path.join(process.cwd(), process.argv[2]);
const basename = path.basename(htmlFile, path.extname(htmlFile));
const projectDir = path.dirname(path.dirname(htmlFile));

if (!['.html', '.htm'].includes(path.extname(htmlFile))) {
	console.error(`${htmlFile} does not appear to be an HTML file`);
	process.exit(1);
}

if (!fs.existsSync(htmlFile)) {
	console.error(`${htmlFile} is not a valid file`);
	process.exit(1);
}

let emptyLines = 0;
let nonEmptyLines = 0;

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



let consecutiveLines = 0;
$("body > div > div > table").each((t,table) => {
	console.log('NEW TABLE');

	const colHeaders = [];
	$(table).children("thead").children("tr").children('td').each((i,e) => {
		colHeaders.push($(e).text());
	});

	let colIds;
	if (colHeaders.length === 3) {
		colIds = [
			'IV',
			'crewA',
			'crewB'
		];
	} else {
		colIds = [];
		for (const text of colHeaders) {
			if (text.indexOf('IV') > -1) {
				colIds.push('IV')
			} else if (text.indexOf('EV1') > -1) {
				colIds.push('crewA');
			} else if (text.indexOf('EV2') > -1) {
				colIds.push('crewB');
			} else {
				console.error('CURRENTLY ONLY IV, EV1, EV2 ACTORS ARE SUPPORTED');
			}
		}
	}
	console.log(colIds);

	let taskText = '';
	$(table).children("tbody").children("tr").each((r,row) => {
		let rowText = [[],[],[]];
		let actorKeys = [];

		$(row).children("td").each((c,col) => {
			let $td = $(col);
			let colspan = $td.attr('colspan');
			let colId;
			if (colspan && colspan > 1) {
				colId = colIds.slice(c, c + colspan).join(' + ');
			} else {
				colId = colIds[c];
			}
			actorKeys.push(colId);

			if (c > 2) {
				console.error(`bad column: ${c}`);
				console.error($(row).text());
			}
			$(col).children('p').each((p,para) => {
				rowText[c].push(processParagraph(p, para));
			});
		});

		taskText = createSyncedSimoBlocks(rowText, actorKeys);
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


const tasksDir = path.join(projectDir, 'tasks');
const procsDir = path.join(projectDir, 'procedures');

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
console.log(`empty lines = ${emptyLines}, non-empty = ${nonEmptyLines}`);
console.log("complete!");



function processParagraph(index, paragraphSourceText) {
	let paraElem = $(paragraphSourceText);

	const titleRegex = /([A-Z ]+)\((\d{2}:\d{2})\)/;
	let step = paraElem.text()
		.replace('"', '\\"')
		.replace('&nbsp;', ' ')
		.replace('\n', ' ')
		.replace(/\s+/g, ' ')
		.replace('EV1', '{{role:crewA}}')
		.replace('EV2', '{{role:crewB}}')
		.replace('Ö', '{{CHECK}}')
		.replace('¬', '{{LEFT}}')
		.replace('®', '{{RIGHT}}')
		.replace('à', '{{RIGHT}}')
		.replace('ß', '{{LEFT}}')
		// .replace('�', '')
		// .replace('�', '')
		// .replace('�', '')
		// .replace('�', '')
		// .replace('� ', '...')
		// .replace('�', '') <-- false ellipsis (...)
		// .replace('�', '')
		// .replace('�', '')
		// .replace('���', '')

		.replace('”', '\\"')
		.trim()
		.replace(/^\d+\. /,'')
		.trim();

	let isCheckboxList = step.indexOf("q ") === 0 || step.indexOf("qq") === 0;
	let titleMatch = step.match(titleRegex);

	let paragraphYamlText = '';
	if (step) {
		if (isCheckboxList) {
			step = step.slice(2);
			if (!wasCheckboxList) {
				paragraphYamlText += `          checkboxes:\n`;
			}
			paragraphYamlText += `            - "${step}"\n`;
			wasCheckboxList = true;
		} else {
			if (titleMatch && titleMatch[1].trim()) {
				let duration = titleMatch[2].split(':').map((elem) => { return parseInt(elem); });
				paragraphYamlText += `        - title: "${titleMatch[1].trim()}"\n`;
				paragraphYamlText += `          duration:\n`;
				paragraphYamlText += `            hours: ${duration[0]}\n`;
				paragraphYamlText += `            minutes: ${duration[1]}\n`;
			} else {
				paragraphYamlText += `        - step: "${step}"\n`;
			}
			wasCheckboxList = false;
		}
	}
	if (paragraphYamlText.trim() === '') {
		emptyLines++;
		// console.log('empty line');
		paragraphYamlText = false;
	} else {
		nonEmptyLines++;
		// console.log('line not empty');
	}
	return paragraphYamlText;
}

/**
 * Take an array comprising the three rows of the procedure, and process it into one or more 'simo'
 * blocks
 * @param  {[Array]} rowArray Array of the form [[col,0,steps], [col,1,steps], [col,2,steps]]
 * @return {[string]}         YAML text with at least one simo block
 */
function createSimoBlocks(rowArray, actorKeys) {

	// Don't allow the simo block to have more than this many consecutive steps for a single actor,
	// due to an issue with Word or the npm docx library. Rows are set not to break across a page,
	// but if a row is bigger than one page it _must_ break across a page and currently it does not.
	// Instead, it just disappears beyond the length of the page.
	const maxBlockLength = 20;

	// const actorKeys = [
	// 	'      IV:\n',
	// 	'      crewA:\n',
	// 	'      crewB:\n'
	// ];
	let rowYamlText;

	console.log(`creating simo block. column lengths = ${rowArray[0].length}, ${rowArray[1].length}, ${rowArray[2].length}`);
	if (rowArray[0].length > 0 || rowArray[1].length > 0 || rowArray[2].length > 0) {
		rowYamlText = '  - simo:\n\n';
		for (let i = 0; i < rowArray.length; i++) {
			if (rowArray[i].length > 0) {
				let actorStepsAdded = '';
				for (const line of rowArray[i]) {
					if (line !== false) {
						actorStepsAdded += line;
					}
				}
				if (actorStepsAdded !== '') {
					rowYamlText += actorKeys[i] + actorStepsAdded;
				}
			}
		}
	} else {
		rowYamlText = '';
	}

	return rowYamlText;
}


function createSyncedSimoBlocks(rowArray, actorKeys) {

	// Don't allow the simo block to have more than this many consecutive steps for a single actor,
	// due to an issue with Word or the npm docx library. Rows are set not to break across a page,
	// but if a row is bigger than one page it _must_ break across a page and currently it does not.
	// Instead, it just disappears beyond the length of the page.
	const maxBlockLength = 20;

	// how many empty lines together to consider it a cluster requiring a sync point
	const emptyLineClusterSize = 2;

	actorKeys = actorKeys.map((val) => { return `      ${val}:\n`; });
	console.log('using actor keys...');
	console.log(actorKeys);
	// const actorKeys = [
	// 	'      IV:\n',
	// 	'      crewA:\n',
	// 	'      crewB:\n'
	// ];
	let rowYamlText;

	let index = 0;
	let somethingelse = [0, 0, 0];
	let keepRowing = true;

	let output = '';

	let consecBlanks,
		nextBlock;

	const validStep = function(step) {
		return step && typeof step === 'string' && step.trim() !== '';
	};

	const stepIsSubstep = function(step) {
		if (!step) {
			return false;
		}

		// substeps have at least 6 space in front
		return step.indexOf('          ') === 0;
	};

	const reset = function() {
		consecBlanks = [0, 0, 0];
		nextBlock = [[], [], []];
	};
	reset();

	while (keepRowing) {
		const iv = rowArray[0][index];
		const ev1 = rowArray[1][index];
		const ev2 = rowArray[2][index];

		const current = [
			rowArray[0][index],
			rowArray[1][index],
			rowArray[2][index]
		];

		const next = [
			rowArray[0][index + 1],
			rowArray[1][index + 1],
			rowArray[2][index + 1]
		];

		let nextStepContainsSubstep;
		if (stepIsSubstep(next[0]) || stepIsSubstep(next[1]) || stepIsSubstep(next[2])) {
			nextStepContainsSubstep = true;
		} else {
			nextStepContainsSubstep = false;
		}

		if (validStep(iv)) {
			nextBlock[0].push(iv);
			consecBlanks[0] = 0;
		} else {
			consecBlanks[0]++;
		}

		if (validStep(ev1)) {
			nextBlock[1].push(ev1);
			consecBlanks[1] = 0;
		} else {
			consecBlanks[1]++;
		}

		if (validStep(ev2)) {
			nextBlock[2].push(ev2);
			consecBlanks[2] = 0;
		} else {
			consecBlanks[2]++;
		}

		if (consecBlanks[0] > emptyLineClusterSize && validStep(rowArray[0][index + 1]) && !nextStepContainsSubstep) {
			output += createSimoBlocks(nextBlock, actorKeys);
			reset();
		}

		if (consecBlanks[1] > emptyLineClusterSize && validStep(rowArray[1][index + 1]) && !nextStepContainsSubstep) {
			output += createSimoBlocks(nextBlock, actorKeys);
			reset();
		}

		if (consecBlanks[2] > emptyLineClusterSize && validStep(rowArray[2][index + 1]) && !nextStepContainsSubstep) {
			output += createSimoBlocks(nextBlock, actorKeys);
			reset();
		}

		let longest = nextBlock.reduce((prev,cur) => { return cur.length > prev ? cur.length : prev }, 0);

		if (longest > maxBlockLength && !nextStepContainsSubstep) {
			output += createSimoBlocks(nextBlock, actorKeys);
			reset();
		}

		index++;

		// safety net until this is less kludgy
		if (index > 10000) {
			keepRowing = false;
		}
	}

	if (nextBlock[0].length || nextBlock[1].length || nextBlock[2].length) {
		output += createSimoBlocks(nextBlock, actorKeys);
	}

	return output;
}
