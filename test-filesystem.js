const { FileSystemTools } = require('./dist/tools/filesystem');
const path = require('path');

// Mock context
const context = {
  workingDirectory: process.cwd(),
  recentFiles: []
};

async function testFileSystem() {
  console.log('Testing file system tools...');
  
  // Test write file
  console.log('1. Testing write_file...');
  const writeResult = await FileSystemTools.writeFile('test-output.txt', 'Hello from file system tools!', context);
  console.log('Write result:', writeResult);
  
  // Test read file
  console.log('2. Testing read_file...');
  const readResult = await FileSystemTools.readFile('test-output.txt', context);
  console.log('Read result:', readResult);
  
  // Test list files
  console.log('3. Testing list_files...');
  const listResult = await FileSystemTools.listFiles('.', context, 'test-output.txt');
  console.log('List result:', listResult);
}

testFileSystem().catch(console.error);