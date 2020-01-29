#!/usr/bin/env node

'use strict';

if (!process.argv[2]) {
	console.error('You must pass a valid path to the xml zip file into this script');
	process.exit(1);
}

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const AdmZip = require('adm-zip');

const ipvZipFile = path.join(process.cwd(), process.argv[2]);
const ipvFileDir = path.dirname(ipvZipFile);
const basename = path.basename(ipvZipFile, path.extname(ipvZipFile));

// Extract IPV Zip file that contains XML and Images
const zip = new AdmZip(ipvZipFile);
zip.extractAllTo(ipvFileDir, true);

const ipvFile = path.join(ipvFileDir, `${basename}.xml`);

const projectDir = path.dirname(ipvFileDir);
const tasksDir = path.join(projectDir, 'tasks'); // should be called activityDir need to fix when merging
const procsDir = path.join(projectDir, 'procedures');
const ipvSourceImageDir = path.join(ipvFileDir, `${basename}_files`);
const imagesDir = path.join(projectDir, 'images');
const odfSymbols = require('./odfSymbolMap.js');

if (!fs.existsSync(tasksDir)) {
	fs.mkdirSync(tasksDir);
}
if (!fs.existsSync(procsDir)) {
	fs.mkdirSync(procsDir);
}
if (!fs.existsSync(procsDir)) {
	fs.mkdirSync(imagesDir);
}

// Read file directory from xml zip file and move images to patify image folder
fs.readdir(ipvSourceImageDir, function(err, files) {
	if (err) {
		throw err;
	}
	files.forEach(function(file) {
		fs.rename(path.join(ipvSourceImageDir, file), path.join(imagesDir, file), (err) => {
			if (err) {
				throw err;
			}

		});

	});

	console.log('Images loaded');
});

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
		fs.readFileSync(ipvFile),
		{
			xmlMode: true,
			lowerCaseTags: true
		}
	);
	console.log('XML loaded');
} catch (err) {
	throw new Error(err);
}

/**
 * Returns cleaned up text from given object
 * @param {Object} input object to obtain clean text from
 * @return {string}      sanatized text
 */
function sanatizeInput(input) {
	return input.text().trim()
		.replace(/\s+/g, ' ')
		.replace(/&/g, '&amp;');
}

/**
 *
 * @param {Object} subject      object with tag that you want to compare
 * @param {string} comparison   string to compare with
 * @param {string} option       how to compare: tagName or includes tagName
 * @return {boolean}
 */
function compareTag(subject, comparison, option = 'tagName') {
	if (option === 'tagName') {
		return $(subject).prop('tagName').toLowerCase() === comparison;
	} else if (option === 'includes') {
		return $(subject).prop('tagName').toLowerCase().includes(comparison);
	}
}

/**
 * parse trhough itemized list tags (location, duration, crew)
 * @return {string}  yaml markup for location, duration, crew,
 *                   ref procedures
 */
function getItemizedLists() {
	let outPut = '';
	$('itemizedlist').each(function(index, element) {
		outPut += `${
			sanatizeInput(
				$(element).find('listtitle')
			)
				.replace(':', '')
				.replace(' ', '_')
		}:\n`;
		$(element).children('para').each(function(index, element) {
			outPut += `  - |\n    ${sanatizeInput($(element))}\n`;
		});

	});

	return outPut;
}

/**
 *
 * @param {Object} element tools, parts, or materials object
 * @param {string} indent  current yaml indent for output
 * @param {string} outPut  yaml output
 * @return {string}        yaml output
 */
function parseTools(element, indent, outPut = '') {
	$(element).children().each(function(index, element) {
		if (compareTag(element, 'toolsitem')) {
			outPut += `${indent}- toolName: ${sanatizeInput($(element).children('toolsitemname'))}\n`;
			outPut += `${indent}  partNumber: "${sanatizeInput($(element).children('partnumber'))}"\n`;
		} else if (compareTag(element, 'containeritem', 'includes')) {
			return;
		} else if (compareTag(element, 'container', 'includes')) {
			outPut += `${indent}- containerName: ${$(element).children('containeritem').text().trim()}\n`;
			outPut += `${indent}  containerContents:\n`;
		}

		parseTools(element, indent + '  ', outPut);
	});

	return outPut;

}

/**
 * Runs parseTools for tools, parts, materials section
 * @return {string}     yaml output
 */
function getToolsPartsMarterials() {
	let outPut = '';
	const sectionList = ['parts', 'materials', 'tools'];
	sectionList.forEach((element) => {

		outPut += `${element}:\n`;
		outPut += parseTools(element, '  ');

	});

	return outPut;
}

/**
 * retrieves yaml output for an image
 * @param {Object} element  xml tag with image in it
 * @param {string} indent   current yaml indent
 * @return {string}         yaml output
 */
function getImages(element, indent) {
	let imageYaml = '';
	$(element).children('image').each(function(index, element) {
		const alt = $(element).find('imagereference').attr('alt').replace(/(.*)\//, '');
		const height = $(element).find('imagereference').attr('height');
		const width = $(element).find('imagereference').attr('width');
		const source = $(element).find('imagereference').attr('source').replace(/(.*)\//, '');
		const text = sanatizeInput($(element).find('imagetitle > text'));
		imageYaml += `${indent}    - images:\n${indent}      - path: "${source}"\n${indent}        text: "${text}"\n${indent}        width: ${width}\n${indent}        height: ${height}\n${indent}        alt: "${alt}"\n`;
	});
	return imageYaml;
}

/**
 * retrieves header content of procedure
 * @return {string}  procedure header yaml
 */
function getProcHeader() {
	let output = '';
	output += `schemaVersion: ${$('schemaversion').text().trim()}\n`;
	output += `authoringTool: ${$('authoringtool').text().trim()}\n`;
	output += 'metaData:\n';
	output += `  procType: ${$('metadata').attr('proctype')}\n`;
	output += `  status: ${$('metadata').attr('status')}\n`;
	output += `  date: ${sanatizeInput($('metadata > date'))}\n`;
	output += `  uniqueid: ${sanatizeInput($('metadata > uniqueid'))}\n`;
	output += `  book: ${sanatizeInput($('metadata > book'))}\n`;
	output += `  applicability: ${sanatizeInput($('metadata > applicability'))}\n`;
	output += `  version: ${sanatizeInput($('metadata > version'))}\n`;
	output += `  procCode: ${sanatizeInput($('metadata > proccode'))}\n`;
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
		// doesn't do anything, title is handled when a step tag is found
	} else if (tagType === 'clarifyinginfo') {
		const ncwType = $(element).attr('infoType');
		outPut += `${indent}    - ${ncwType}:\n`;
		$(element).children('infotext').each(function(index, element) {
			const content = sanatizeInput($(element));
			outPut += `${indent}      - "${content}"\n`;
		});
	} else if (tagType === 'stepcontent') {
		// StepContent consists of: offnominalblock, alternateblock
		// groundblock, image, table, itemizedlist, locationinfo, instruction, navinfo
		// StepContent has attributes: itemID, checkBoxes, spacingAbove
		const instruction = sanatizeInput($(element).children('instruction'));
		if (instruction) {
			outPut += `${indent}    - step: | \n${indent}       "${instruction}"\n`;
		}

		outPut += getImages(element, indent);
	} else if (tagType === 'step') {
		const titleElement = $(element).children('stepTitle');

		const stepTitle = sanatizeInput(
			$(titleElement)
				.find('instruction')
		);

		const stepNumber = sanatizeInput(
			$(titleElement)
				.children('stepnumber')
		);

		outPut += `${indent}    - step: | \n${indent}       "${stepTitle}"\n${indent}      stepnumber: ${stepNumber}\n`;

		if ($(titleElement).next().length > 0) {
			outPut += `${indent}      substeps:\n`;
		}
		// this is the begining of a substep
		$(element).children().each(function(index, element) {
			outPut += getSubStep(element, indent + '  ');
		});

	}
	return outPut;

}

/**
 * iterates over each top level step tag for each tag it calls getSubStep()
 * @return {string}  yaml output
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

			const title = sanatizeInput(
				$(majorStep).children('text')
			);
			const stepnumber = sanatizeInput(
				$(majorStep).children('stepnumber')
			);

			outPut += `${indent}- title: "${title}"\n${indent}  stepnumber: ${stepnumber}\n`;

			if ($(majorStep).next().length > 0) {
				outPut += `${indent}  substeps:\n`;
			}

			$(majorStep).siblings().each(function(index, element) {
				outPut += getSubStep(element, indent);
			});

		});

	});

	return outPut;
}

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
