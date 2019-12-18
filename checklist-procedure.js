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
	var stepYaml = '';

	$(step).children().each(function(index, element) {
		var instruction;
		var tagType = $(element).prop('tagName');
		var itemid;

		if (tagType.toLowerCase() === 'steptitle') {
			var text = $(element).find('> text').text().trim().replace(/\s+/g, ' ').replace('"', '\\"');
			var locationInfo = $(element).find('locationInfo').text().trim().replace(/\s+/g, ' ').replace(/"/g, '\\"');
			// todo find and replace all symbol/center tags to {{templates}}

			// $('Symbol').each(function(index, element) {
			// 	let name = $(element).attr('name');
			// 	if (name == 'nbsp') {
			// 		$(element).replaceWith(`<text>   </text>`);
			// 	} else {
			// 		$(element).replaceWith(`<text>{{${name}}}</text>`);
			// 	}

			// });

			$('VerifyCallout').each(function(index, element) {
				const verifyType = $(element).attr('verifyType');
				const instructionText = $(element).text().trim();
				$(element).replaceWith(`<text>{{${verifyType}}} ${instructionText}</text>`);
			});
			instruction = $(element).find('instruction').children().text().trim().replace(/\s+/g, ' ');
			// instruction = instruction.replace(/"/g, '\\"');
			// What is navInfo used for?
			var navInfo = $(element).find('navInfo').text().trim().replace(/\s+/g, ' ').replace('"', '\\"');

			stepYaml += `${indent}- title: "${text}"\n`;
			if (locationInfo !== '') {
				stepYaml += `${indent}  locationInfo: "${locationInfo}"\n`;
			}
			if (instruction !== '') {
				instruction = instruction.replace(/"/g, '\\"');
				stepYaml += `${indent}- step: "${instruction}"\n`;
			}
			if (navInfo !== '') {
				stepYaml += `${indent}  navInfo: "${navInfo}"\n`;
			}

		} else if (tagType.toLowerCase() === 'clarifyinginfo') {
			var type = $(element).attr('infoType').replace('"', '\\"');
			// Not sure if we need this one.
			// var isNumbered = $(element).attr('isnumbered');
			// itemid = $(element).attr('itemId').replace('"', '\\"');
			// Might need to pull html for content to get symbols
			var content = $(element).text().trim().replace(/\s+/g, ' ').replace('"', '\\"');

			stepYaml += `${indent}- ${type}: "${content}"\n`;
		} else if (tagType.toLowerCase() === 'stepcontent') {
			instruction = $(element).find('instruction').text().trim().replace(/\s+/g, ' ');
			instruction = instruction.replace(/"/g, '\\"');
			// itemid = $(element).attr('itemId').replace('"', '\\"');
			if (instruction !== '') {
				stepYaml += `${indent}- step: "${instruction}"\n`;
			}

			// CHECK FOR IMAGES
			// $(element).children().each(function(index, element) {
			// 	var tagType = $(element).prop('tagName');

			// 	if (tagType.toLowerCase() === 'image') {
			// 		var alt = $(element).find('imagereference').attr('alt');
			// 		var height = $(element).find('imagereference').attr('height');
			// 		var width = $(element).find('imagereference').attr('width');
			// 		var source = $(element).find('imagereference').attr('source');
			// 		var text = $(element).find('imagetitle > text').text().trim().replace(/\s+/g, ' ');

			// 		stepYaml += `${indent}  - image: "${source}"\n${indent}    text: "${text}"\n${indent}    width: ${width}\n${indent}    height: ${height}\n${indent}    alt: "${alt}"\n`;
			// 	}
			// });

		} else if (tagType.toLowerCase() === 'step') {
			stepYaml += `${indent}- substeps:\n`;
			indent += '    ';
			stepYaml += stepCheck(element);
			indent = '    ';

		}
		// todo fix this hard coding of six spaces

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

				// });

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
