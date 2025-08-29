import { ConsoleManager } from './build/console-manager.js';

async function testEncoding() {
    const manager = new ConsoleManager();
    
    console.log('创建控制台 🚀');
    const console1 = await manager.createConsole('pwsh', undefined, undefined, 'test-encoding');
    console.log('控制台创建成功:', console1);
    
    console.log('\n执行命令 echo 🌟 Hello World!');
    const result = await manager.executeSync('test-encoding', 'echo 🌟 Hello World!');
    console.log('执行结果:', result);
    
    console.log('\n获取控制台输出 📋');
    const output = manager.getConsoleOutput('test-encoding');
    console.log('输出内容:', output);
    
    console.log('\n关闭控制台 ✅');
    manager.closeConsole('test-encoding');
    console.log('测试完成!');
}

testEncoding().catch(console.error);
