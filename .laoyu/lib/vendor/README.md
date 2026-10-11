# ZIP读取组件

Skill安装使用yauzl 3.4.0与pend 1.2.0（MIT），完整许可证分别位于对应目录。
来源：https://github.com/thejoshwolfe/yauzl 、https://github.com/andrewrk/node-pend。
仅将fd-slicer.js中的pend引用改为随包的相对路径。生产端不需要npm安装。

安装器校验整个ZIP的GitHub SHA-256、解压大小/条目数、路径/链接/重复冲突、CRC、Skill名称以及逐文件清单。不运行随包脚本。
