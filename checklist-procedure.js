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

const indent = '    ';
let outPut = '';
let stepYaml = '';

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

function getImages(element, indent) {
	let imageYaml = '';
	$(element).children('image').each(function(index, element) {
		const alt = $(element).find('imagereference').attr('alt');
		const height = $(element).find('imagereference').attr('height');
		const width = $(element).find('imagereference').attr('width');
		const source = $(element).find('imagereference').attr('source');
		const text = $(element).find('imagetitle > text').text().trim().replace(/\s+/g, ' ');
		imageYaml += `${indent}- images:\n${indent}  - path: "${source}"\n${indent}    text: "${text}"\n${indent}    width: ${width}\n${indent}    height: ${height}\n${indent}    alt: "${alt}"\n`;
	});
	return imageYaml;
}

function getSubStep(element, indent) {
	let outPut = '';
	const tagType = $(element).prop('tagName');
	// Steptitle consists of locationinfo, stepnumber, centername
	// choicereference, symbol, text, instruction, navinfo
	// todo reference other procedures for application of locationinfo,
	// todo centername, choicereference, symbol, instruction, navinfo
	// If title is direct child of steptitle tag then that is the step title
	// We won't use stepnumber to generate the actual procedure but am tracking for now

	if (tagType.toLowerCase() === 'steptitle') {
		const title = $(element).children('text').text().trim().replace(/\s+/g, ' ');
		const instruction = $(element).children('instruction').text().trim().replace(/\s+/g, ' ');

		if (title) {
			outPut += `${indent}- title: |\n${indent}     ${title}\n`;
		} else if (instruction) {
			// todo figure out how to handle each of these scenarios
			// Instruction includes <PhysicalDeviceCallout>, <CmdCallout>,
			// <VerifyCallout>, <InputCallout> <AutomationCallout>,
			// <SelectCallout>, <GotoStep>, <ClearText>, <ProcedureDeparture>,
			// <ConditionalStatement>, <LoopStatement>, <CenterOnGo>,
			// <RecordStatement>, <CalculateStatement>, <Stow>
			outPut += `${indent}- step: |\n${indent}     ${instruction}\n`;
		}
	}

	// notes, cautions, warnings
	if (tagType.toLowerCase() === 'clarifyinginfo') {
		const ncwType = $(element).attr('infoType').replace('"', '\\"');
		outPut += `${indent}- ${ncwType}:\n`;
		$(element).children('infotext').each(function(index, element) {
			const content = $(element).text().trim().replace(/\s+/g, ' ').replace('"', '\\"');
			outPut += `${indent}    - "${content}"\n`;
		});
	} else if (tagType.toLowerCase() === 'stepcontent') {
		// StepContent consists of: offnominalblock, alternateblock
		// groundblock, image, table, itemizedlist, locationinfo, instruction, navinfo
		// StepContent has attributes: itemID, checkBoxes, spacingAbove
		const instruction = $(element).children('instruction').text().trim().replace(/\s+/g, ' ');
		if (instruction) {
			outPut += `${indent}     ${instruction}\n`;
		}

		outPut += getImages(element, indent);
	} else if (tagType.toLowerCase() === 'step') {
		// this is the begining of a substep
		$(element).children().each(function(index, element) {
			outPut += getSubStep(element, indent);
		});

	}
	return outPut;

}

function stepCheck(procedure, indent) {
	$(procedure).children('steptitle').each(function(index, majorStep) {

		const title = $(majorStep).children('text').text().trim().replace(/\s+/g, ' ').replace('"', '\\"');
		const stepnumber = $(majorStep).children('stepnumber').text().trim().replace(/\s+/g, ' ').replace(/"/g, '\\"');

		stepYaml += `${indent}- title: "${title}"\n${indent}  stepnumber: ${stepnumber}\n${indent}  substeps:\n`;
		indent += '    ';
		$(majorStep).siblings().each(function(index, element) {
			stepYaml += getSubStep(element, indent);
		});

	});
	return stepYaml;
}

// function formatMetaData(meta) {
// return `metaData:
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
			// var procType = $(element).attr('proctype');
			// var status = $(element).attr('status');
			// var date = $(element).find('date').text().trim().replace(/\s+/g, ' ');
			// var uniqueId = $(element).find('uniqueid').text().trim().replace(/\s+/g, ' ');
			// var book = $(element).find('book').text().trim().replace(/\s+/g, ' ');
			// eslint-disable-next-line max-len
			// var applicability = $(element).find('applicability').text().trim().replace(/\s+/g, ' ');
			// var version = $(element).find('version').text().trim().replace(/\s+/g, ' ');
			// var procCode = $(element).find('proccode').text().trim().replace(/\s+/g, ' ');
			// outPut = formatMetaData({
			// procType: procType,
			// status: status,
			// date: date,
			// uniqueId: uniqueId,
			// book: book,
			// applicability: applicability,
			// version: version,
			// procCode: procCode
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
					// console.log(toolType);
					if (toolType.toLowerCase() === 'toolsitem') {
						// eslint-disable-next-line max-len
						// const toolFields = ['toolsitemname', 'partnumber', 'serialnumber', 'barcode', 'quantity', 'comment', 'gotostep'];
						// todo print out list of tools and containers showing all fields and tree
						// for (const field in toolFields) {
						//  const content = $(element).find(toolFields[field]).text().trim();
						// }
						// console.log(toolType);

					}
					// else if (toolType.toLowerCase() === 'container1') {

					// }

				});

			});
		} else if (tagType.toLowerCase() === 'step') {
			outPut = stepCheck(element, indent);
		}

	});

	return outPut;

}

// FIXME TESTING SYMBOL TAG SELECTING
// $('Symbol').each(function(index, element) {
// let name = $(element).attr('name');
// if (name == 'nbsp') {
//  $(element).replaceWith(`<text>   </text>`);
// } else {
//  $(element).replaceWith(`<text>{{${name}}}</text>`);
// }

// });

$('VerifyCallout').each(function(index, element) {
	const verifyType = $(element).attr('verifyType').toUpperCase();
	const verifyParent = $(element).parent();
	$(verifyParent).prepend(`<text>{{${verifyType}}}</text>`);
});

$('Symbol').each(function(index, element) {
	const symbolType = $(element).attr('name').toUpperCase();
	$(element).prepend(`<text>{{${symbolType}}}</text>`);
});

$('verifyoperator').each(function(index, element) {
	const symbolType = $(element).attr('operator').toUpperCase();
	$(element).prepend(`<text>{{${symbolType}}}</text>`);
});

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
