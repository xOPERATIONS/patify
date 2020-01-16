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
const odfSymbols = require('./odfSymbolMap.js');

let outPut = '';

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

// TODO create cleanup function to escape ", replace symbols
// .replace("Microsoft", "W3Schools");

function sanatizeInput(text) {
	return text.trim()
		.replace(/\s+/g, ' ')
		.replace('"', '\\"');
}

function getItemizedLists() {
	let outPut = '';
	$('itemizedlist').each(function(index, element) {
		outPut += `${$(element).find('listtitle').text().trim().toLowerCase().replace(/\s+/g, ' ').replace(':', '').replace(' ', '_')}:\n`;
		$(element).children('para').each(function(index, element) {
			outPut += `  - |\n    ${$(element).text().trim().replace(/\s+/g, ' ').replace('"', '\\"')}\n`;
		});

	});

	return outPut;
}

function parseTools(element, indent) {
	$(element).children().each(function(index, element) {
		if ($(element).prop('tagName').toLowerCase() === 'toolsitem') {
			// outPut += `${indent}tool:\n`;
			outPut += `${indent}- toolName: ${$(element).children('toolsitemname').text().trim().replace(/\s+/g, ' ').replace('"', '\\"')}\n`;
			outPut += `${indent}  partNumber: "${$(element).children('partnumber').text().trim().replace(/\s+/g, ' ').replace('"', '\\"')}"\n`;
		} else if ($(element).prop('tagName').toLowerCase().includes('containeritem')) {
			return;
		} else if ($(element).prop('tagName').toLowerCase().includes('container')) {
			outPut += `${indent}- containerName: ${$(element).children('containeritem').text().trim()}\n`;
			outPut += `${indent}  containerContents:\n`;
		}

		parseTools(element, indent + '  ');
	});

	return outPut;

}

function getToolsPartsMarterials() {
	let outPut = '';
	const sectionList = ['parts', 'materials', 'tools'];
	sectionList.forEach((element) => {

		outPut += `${element}:\n`;
		outPut += parseTools(element, '  ');

	});

	return outPut;
}

function getImages(element, indent) {
	let imageYaml = '';
	$(element).children('image').each(function(index, element) {
		const alt = $(element).find('imagereference').attr('alt');
		const height = $(element).find('imagereference').attr('height');
		const width = $(element).find('imagereference').attr('width');
		const source = $(element).find('imagereference').attr('source');
		const text = sanatizeInput($(element).find('imagetitle > text').text());
		imageYaml += `${indent}    - images:\n${indent}    - path: "${source}"\n${indent}      text: "${text}"\n${indent}      width: ${width}\n${indent}      height: ${height}\n${indent}      alt: "${alt}"\n`;
	});
	return imageYaml;
}

function getProcHeader() {
	let output = '';
	output += `schemaVersion: ${$('schemaversion').text().trim()}\n`;
	output += `authoringTool: ${$('authoringtool').text().trim()}\n`;
	output += 'metaData:\n';
	output += `  procType: ${$('metadata').attr('proctype')}\n`;
	output += `  status: ${$('metadata').attr('status')}\n`;
	output += `  date: ${sanatizeInput($('metadata > date').text())}\n`;
	output += `  uniqueid: ${sanatizeInput($('metadata > uniqueid').text())}\n`;
	output += `  book: ${$('metadata > book').text().trim().replace(/\s+/g, ' ')}\n`;
	output += `  applicability: ${$('metadata > applicability').text().trim().replace(/\s+/g, ' ')}\n`;
	output += `  version: ${$('metadata > version').text().trim().replace(/\s+/g, ' ')}\n`;
	output += `  procCode: ${$('metadata > proccode').text().trim().replace(/\s+/g, ' ')}\n`;
	output += `procedure_number: ${$('proctitle > procnumber').text().trim()}\n`;
	output += `procedure_name: ${$('proctitle > text').text().trim()}\n`;
	output += `procedure_objective:  |\n  ${$('procedureobjective').text().trim()}\n`;
	output += getItemizedLists(); // gets duration, crew, location data
	output += getToolsPartsMarterials();
	output += `columns:
  - key: IV
    actors: "*"

tasks:
  - file: ${basename}.yml
    roles:
      IV1: IV`;
	return output;
}

/**
 *
 * @param {Object} element parent xml tag
 * @param {string} indent  current indent for correct yaml formating
 * @return {string}        yaml text of substep
 */
function getSubStep(element, indent) {
	let outPut = '';
	const tagType = $(element)
		.prop('tagName')
		.toLowerCase();
	// Steptitle consists of locationinfo, stepnumber, centername
	// choicereference, symbol, text, instruction, navinfo
	// todo reference other procedures for application of locationinfo,
	// todo centername, choicereference, symbol, instruction, navinfo
	// If title is direct child of steptitle tag then that is the step title
	// We won't use stepnumber to generate the actual procedure but am tracking for now

	if (tagType === 'steptitle') {
		// const title = $(element)
		// .children('text').text().trim()
		// // !FIXME consistently clean text
		// .replace(/\s+/g, ' ');
		// const instruction = $(element)
		// .children('instruction')
		// .text().trim().replace(/\s+/g, ' ');

		// if (title) {
		// outPut += `${indent}  - title: |\n${indent}     ${title}\n`;
		// } else if (instruction) {
		// // todo figure out how to handle each of these scenarios
		// // Instruction includes <PhysicalDeviceCallout>, <CmdCallout>,
		// // <VerifyCallout>, <InputCallout> <AutomationCallout>,
		// // <SelectCallout>, <GotoStep>, <ClearText>, <ProcedureDeparture>,
		// // <ConditionalStatement>, <LoopStatement>, <CenterOnGo>,
		// // <RecordStatement>, <CalculateStatement>, <Stow>
		// outPut += `${indent}  - step: |\n${indent}     ${instruction}\n`;

	} else if (tagType === 'clarifyinginfo') {
		const ncwType = sanatizeInput(
			$(element).attr('infoType')
		);
		outPut += `${indent}    - ${ncwType}:\n`;
		$(element).children('infotext').each(function(index, element) {
			const content = sanatizeInput(
				$(element).text()
			);
			outPut += `${indent}      - "${content}"\n`;
		});
	} else if (tagType === 'stepcontent') {
		// StepContent consists of: offnominalblock, alternateblock
		// groundblock, image, table, itemizedlist, locationinfo, instruction, navinfo
		// StepContent has attributes: itemID, checkBoxes, spacingAbove
		const instruction = $(element).children('instruction').text().trim().replace(/\s+/g, ' ');
		if (instruction) {
			outPut += `${indent}    - step: | \n${indent}       "${instruction}"\n`;
		}

		outPut += getImages(element, indent);
	} else if (tagType === 'step') {
		const titleElement = $(element).children('stepTitle');

		const stepTitle = sanatizeInput(
			$(titleElement)
				.find('instruction')
				.text()
		);

		const stepNumber = sanatizeInput(
			$(titleElement)
				.children('stepnumber')
				.text()
		);

		outPut += `${indent}    - title: | \n${indent}       "${stepTitle}"\n${indent}      stepnumber: ${stepNumber}\n${indent}      substeps:\n`;
		// this is the begining of a substep
		$(element).children().each(function(index, element) {
			outPut += getSubStep(element, indent + '  ');
		});

	}
	return outPut;

}

/**
 *  @return {string} iterates over each top level step tag
 *                   for each tag it calls getSubStep()
 */
function getSteps() {
	let outPut = '';
	outPut += `title: ${basename}
roles:
  - name: IV1
    duration:
      minutes: 150
steps:
  - IV:\n`;

	$('ChecklistProcedure > step').each(function(index, element) {
		const indent = '      ';
		// todo fixme don't hardcode time
		// taskHeader is equivalent to procedure header for IPV procedures.

		$(element).children('steptitle').each(function(index, majorStep) {

			const title = $(majorStep)
				.children('text').text().trim()
				.replace(/\s+/g, ' ')
				.replace('"', '\\"');
			const stepnumber = $(majorStep)
				.children('stepnumber').text().trim()
				.replace(/\s+/g, ' ')
				.replace(/"/g, '\\"');

			outPut += `${indent}- title: "${title}"\n${indent}  stepnumber: ${stepnumber}\n${indent}  substeps:\n`;
			$(majorStep).siblings().each(function(index, element) {
				outPut += getSubStep(element, indent);
			});

		});

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
	const symbolType = $(element).attr('name');
	const maestroSymbol = odfSymbols.odfToMaestro(symbolType);
	$(element).prepend(`<text>${maestroSymbol}</text>`);
});

$('verifyoperator').each(function(index, element) {
	const symbolType = $(element).attr('operator').toUpperCase();
	$(element).prepend(`<text>{{${symbolType}}}</text>`);
});

// write procedure file
fs.writeFileSync(path.join(procsDir, `${basename}.yml`), `${getProcHeader()}`);
// write task file
fs.writeFileSync(path.join(tasksDir, `${basename}.yml`), `${getSteps()}`);
