#!/usr/bin/env node

'use strict';

if (!process.argv[2]) {
	console.error('You must pass a valid file path into this script');
	process.exit(1);
}

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ipvFile = path.join(process.cwd(), process.argv[2]);
const ipvFileDir = path.dirname(ipvFile);

const projectDir = path.dirname(ipvFileDir);

const tasksDir = path.join(projectDir, 'tasks'); // should be called activityDir need to fix when merging
const procsDir = path.join(projectDir, 'procedures');
const imagesDir = path.join(projectDir, 'images');

var indent = '    ';
var outPut = '';

if (!fs.existsSync(tasksDir)) {
	fs.mkdirSync(tasksDir);
}
if (!fs.existsSync(procsDir)) {
	fs.mkdirSync(procsDir);
}
if (!fs.existsSync(procsDir)) {
	fs.mkdirSync(imagesDir);
}

const basename = path.basename(ipvFile, path.extname(ipvFile));

if (!['.xml'].includes(path.extname(ipvFile))) {
	// Should perform more specific test to check xml is using IPV format
	console.error(`${ipvFile} does not appear to be an XML file`);
	process.exit(1);
}

// Checks if file path exists
if (!fs.existsSync(ipvFile)) {
	console.error(`${ipvFile} is not a valid file`);
	process.exit(1);
}

try {
	console.log('Loading XML');
	var $ = cheerio.load(
		fs.readFileSync(process.argv[2]),
		{
			xmlMode: true,
			lowerCaseTags: true
		}
	);
	console.log('XML loaded');
} catch (err) {
	throw new Error(err);
}

// todo fixme don't hardcode time
// taskHeader is equivalent to procedure header for IPV procedures.
const taskHeader = `title: ${basename}
roles:
  - name: IV1
    duration:
      minutes: 150

steps:
  - IV:
`;

const procedureFooter = `columns:
- key: IV
  actors: "*"

tasks:
  - file: ${basename}.yml
    roles:
      IV1: IV
`;

// TODO create cleanup function to escape ", replace symbols
// .replace("Microsoft", "W3Schools");

function stepCheck(step) {
	let stepYaml = '';

	$(step).children('steptitle').each(function(index, element) {
		indent = '    ';
		// Steptitle consists of locationinfo, stepnumber, centername, choicereference, symbol, text, instruction, navinfo
		// todo reference other procedures to see application of locationinfo, centername, choicereference, symbol, instruction, navinfo
		// If title is direct child of steptitle tag then that is the step title
		const title = $(element).children('text').text().trim().replace(/\s+/g, ' ').replace('"', '\\"');
		let instruction = $(element).children('instruction').text().trim().replace(/\s+/g, ' ').replace(/"/g, '\\"');
		// We won't use stepnumber to generate the actual procedure but am tracking for now
		const stepnumber = $(element).children('stepnumber').text().trim().replace(/\s+/g, ' ').replace(/"/g, '\\"');
		if (title) {
			stepYaml += `${indent}- title: "${title}"\n${indent}  stepnumber: ${stepnumber}\n`;
			let sibilingCount = 0;
			$(element).siblings().each(function(index, element) {
				sibilingCount += 1;
			});
			if (sibilingCount > 0) {
				stepYaml += `${indent}  substeps:\n`;
				indent += '    ';
			}

		} else if (instruction) {
			// todo figure out how to handle each of these scenarios
			// Instruction consists of <PhysicalDeviceCallout>, <CmdCallout> VerifyCallout>, <InputCallout>,
			// <AutomationCallout>, <SelectCallout>, <GotoStep>, <ClearText>, <ProcedureDeparture>, <ConditionalStatement>,
			// <LoopStatement>, <CenterOnGo>, <RecordStatement>, <CalculateStatement>, <Stow>
			indent += '    ';
			stepYaml += `${indent}- step: |\n${indent}     ${instruction}\n`;
		}

		$(element).siblings().each(function(index, element) {
			const tagType = $(element).prop('tagName');

			// notes, cautions, warnings
			if (tagType.toLowerCase() === 'clarifyinginfo') {
				const ncwType = $(element).attr('infoType').replace('"', '\\"');
				const content = $(element).text().trim().replace(/\s+/g, ' ').replace('"', '\\"');
				stepYaml += `${indent}- ${ncwType}: "${content}"\n`;
			} else if (tagType.toLowerCase() === 'stepcontent') {
				// StepContent consists of: offnominalblock, alternateblock, groundblock, image, table, itemizedlist, locationinfo, instruction, navinfo
				// StepContent has attributes: itemID, checkBoxes, spacingAbove
				instruction = $(element).children('instruction').text().trim().replace(/\s+/g, ' ');
				if (instruction) {
					stepYaml += `${indent}     ${instruction}\n`;
				}

				$(element).children('image').each(function(index, element) {
					const alt = $(element).find('imagereference').attr('alt');
					const height = $(element).find('imagereference').attr('height');
					const width = $(element).find('imagereference').attr('width');
					const source = $(element).find('imagereference').attr('source');
					const text = $(element).find('imagetitle > text').text().trim().replace(/\s+/g, ' ');
					stepYaml += `${indent}- images:\n${indent}  - path: "${source}"\n${indent}    text: "${text}"\n${indent}    width: ${width}\n${indent}    height: ${height}\n${indent}    alt: "${alt}"\n`;
				});
			} else if (tagType.toLowerCase() === 'step') {
				// this is the begining of a substep
				stepYaml += stepCheck(element);
			}

		});

	});

	return stepYaml;
}

// function formatMetaData(meta) {
// 	return `metaData:
//   procType: "${meta.procType}"
//   status: "${meta.status}"
//   date: "${meta.date}"
//   uniqueID: "${meta.uniqueId}"
//   book: "${meta.book}"
//   applicability: "${meta.applicability}"
//   version: "${meta.version}"
//   proceCode: "${meta.procCode}"\n`;
// }

function parseTag(tagQuery) {
	outPut = '';

	$(`ChecklistProcedure > ${tagQuery}`).each(function(index, element) {
		var content;
		var tagType = $(element).prop('tagName');

		if (tagType.toLowerCase() === 'schemaversion') {
			content = $(element).text().trim().replace(/\s+/g, ' ');
			outPut = `schemaVersion: ${content}\n`;
		} else if (tagType.toLowerCase() === 'authoringtool') {
			content = $(element).text().trim().replace(/\s+/g, ' ');
			outPut = `authoringTool: "${content}"\n`;
		} else if (tagType.toLowerCase() === 'metadata') {
			var procType = $(element).attr('proctype');
			var status = $(element).attr('status');
			var date = $(element).find('date').text().trim().replace(/\s+/g, ' ');
			var uniqueId = $(element).find('uniqueid').text().trim().replace(/\s+/g, ' ');
			var book = $(element).find('book').text().trim().replace(/\s+/g, ' ');
			var applicability = $(element).find('applicability').text().trim().replace(/\s+/g, ' ');
			var version = $(element).find('version').text().trim().replace(/\s+/g, ' ');
			var procCode = $(element).find('proccode').text().trim().replace(/\s+/g, ' ');
			// outPut = formatMetaData({
			// 	procType: procType,
			// 	status: status,
			// 	date: date,
			// 	uniqueId: uniqueId,
			// 	book: book,
			// 	applicability: applicability,
			// 	version: version,
			// 	procCode: procCode
			// });
		} else if (tagType.toLowerCase() === 'proctitle') {
			var title = $(element).find('text').first().text().trim().replace(/\s+/g, ' ');
			var procNumber = $(element).find('procnumber').text().trim().replace(/\s+/g, ' ');
			outPut = `procedure_name: "${title}"\nprocedure_number: ${procNumber}\n`;
		} else if (tagType.toLowerCase() === 'timerequirement') {
			content = $(element).html().trim().replace(/\s+/g, ' ');
			outPut = `timeRequirement: "${content}"\n`;
			// NEED TO FIND OUT IF THIS IS USED AND WHAT THE
		} else if (tagType.toLowerCase() === 'procedureobjective') {
			content = $(element).text().trim().replace(/\s+/g, ' ');
			outPut = `procedure_objective:  |\n  ${content}\n`;
		} else if (tagType.toLowerCase() === 'itemizedlist') {
			var label = $(element).find('listtitle').text().trim().replace(/\s+/g, ' ');
			label = label.toLowerCase().replace(':', '').replace(' ', '_');
			outPut += (`${label}:  |\n`);
			$(element).find('Para').each(function(index, element) {
				var content = $(element).html().trim().replace(/\s+/g, ' ').replace('"', '\\"');
				outPut += '  ' + content + '\n';
			});

		// Add Tools/Parts Materials
		} else if (tagType.toLowerCase() === 'toolspartsmaterials') {
			$(element).children().each(function(index, element) {
				var tagType = $(element).prop('tagName');
				// console.log(tagType);
				outPut += (`${tagType}:  |\n`);
				$(element).children().each(function(index, element) {
					var toolType = $(element).prop('tagName');
					console.log(toolType);
					if (toolType.toLowerCase() === 'toolsitem') {
						const toolFields = ['toolsitemname', 'partnumber', 'serialnumber', 'barcode', 'quantity', 'comment', 'gotostep'];
						// todo print out list of tools and containers showing all fields and tree
						for (const field in toolFields) {
							const content = $(element).find(toolFields[field]).text().trim().replace(/\s+/g, ' ');
							// console.log(content);
						}
						// console.log(toolType);

					}
					// 	else if (toolType.toLowerCase() === 'container1') {

					// 	}

				});

			});
		} else if (tagType.toLowerCase() === 'step') {
			outPut += stepCheck(element);
		}

	});

	return outPut;

}

// FIXME TESTING SYMBOL TAG SELECTING
// $('Symbol').each(function(index, element) {
// 	let name = $(element).attr('name');
// 	if (name == 'nbsp') {
// 		$(element).replaceWith(`<text>   </text>`);
// 	} else {
// 		$(element).replaceWith(`<text>{{${name}}}</text>`);
// 	}

// });

// $('VerifyCallout').each(function(index, element) {
// 	let verifyType = $(element).attr('verifyType');
// 	$(element).replaceWith(`<text>{{${verifyType}}}</text>`);
// });

var procedure = parseTag('schemaversion');
procedure += parseTag('authoringtool');
procedure += parseTag('metadata');
procedure += parseTag('ProcTitle');
procedure += parseTag('timerequirement');
procedure += parseTag('procedureobjective');
procedure += parseTag('itemizedlist');
procedure += parseTag('toolspartsmaterials');
procedure += procedureFooter;
fs.writeFileSync(path.join(procsDir, `${basename}.yml`), procedure);
var task = taskHeader;
task += parseTag('step');
fs.writeFileSync(path.join(tasksDir, `${basename}.yml`), task);
