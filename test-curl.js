// 测试curl功能的简单脚本
import { createTools } from './build/tools.js';
import { ConsoleManager } from './build/console-manager.js';

async function testCurl() {
  console.log('Testing curl functionality...');
  
  const consoleManager = new ConsoleManager(() => {});
  const tools = createTools(consoleManager);
  
  // 找到curl工具
  const curlTool = tools.find(tool => tool.name === 'curl');
  if (!curlTool) {
    console.error('Curl tool not found!');
    return;
  }
  
  // 测试一个简单的GET请求
  try {
    console.log('Testing HTTP GET request...');
    const result = await curlTool.handler({
      command: 'curl -X GET https://httpbin.org/get',
      timeout: 10
    });
    
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testCurl();
