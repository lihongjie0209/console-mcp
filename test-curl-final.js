import { ConsoleManager } from './build/console-manager.js';

async function testCurl() {
    const manager = new ConsoleManager();
    
    console.log('创建控制台 🚀');
    const console1 = await manager.createConsole('pwsh', undefined, undefined, 'test-curl');
    console.log('控制台创建成功');
    
    console.log('\n测试简单的 HTTP 请求');
    const result = await manager.executeSync('test-curl', 'curl -s https://httpbin.org/json');
    console.log('执行结果:', result);
    
    console.log('\n关闭控制台 ✅');
    manager.closeConsole('test-curl');
    console.log('测试完成!');
}

testCurl().catch(console.error);
