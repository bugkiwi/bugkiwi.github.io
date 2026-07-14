---
title: "从一次性问答到全双工：OtterVoice 的三层架构与故障边界"
date: 2026-07-14
description: "从轮次生命周期、抢话和媒体流边界出发，复盘 OtterVoice 如何从手动语音 Demo 演进为跨平台全双工 SDK。"
tags: [语音交互, 全双工, TypeScript, Web Audio, SDK, ]
slug: ottervoice-full-duplex-engineering-retrospective
draft: false
---

我最初以为，把网页里的“一次点击、一次问答”改成全双工，只要让麦克风持续工作。继续做下去后，我才发现麦克风常亮只是表象。OtterVoice 是我做的一套 TypeScript 语音会话 SDK；这里所谓全双工，是模型处理和播放期间仍能接收用户语音，旧轮次可以被取消，字幕、状态和音频也始终归到正确的 turn。为了让这些条件同时成立，我最终把系统拆成三层：会话内核、平台运行时和模型 Provider。

项目代码在 [bugkiwi/OtterVoice](https://github.com/bugkiwi/OtterVoice)，可以直接打开 [在线 Demo](https://ottervoice.vercel.app) 体验 Web 通路。本文沿着几次改变实现方式的问题展开：为什么 processing 阶段会失聪，为什么实时字幕会意外放大模型成本，为什么 Answer 正常而 Ask 为空，以及为什么一套离线回声测试全部通过后，真实设备上的抢话仍会失败。

![OtterVoice 三层架构：会话内核、平台运行时与 Provider 的职责边界](/images/ottervoice-full-duplex-engineering-retrospective/three-layer-architecture.svg)

*Example 只组合产品策略；决定 turn、理解媒体格式和解析模型协议的知识分别留在 Core、Runtime 与 Provider。*

## 一、三层边界负责阻止故障扩散

OtterVoice 最早来自一份通用语音 SDK 设计。当时仓库里基本只有设计文档，第一阶段完成的是纯 TypeScript 会话内核：状态机、事件、转写记录、Provider 路由、用量统计、错误归一化和可以注入的 RuntimeAdapter。随后才逐步增加 Web、Node、React Native 运行时，以及 OpenRouter、Deepgram、ElevenLabs、Azure Speech 等 Provider。当前仓库有 10 个独立包；这个拆分的价值，在于每个包只拥有一种不可替代的知识。

会话内核知道 `turnId`、状态迁移、上下文和取消。它可以规定 `asr_partial`、`asr_final`、`assistant_text_delta` 分别意味着什么，却不该知道 `MediaRecorder` 什么时候触发最后一个 `dataavailable`。平台运行时知道麦克风权限、WebM 容器、PCM 采样和播放队列，却不该决定一次 partial 是否值得创建模型请求。Provider 知道 HTTP、SSE、WebSocket、模型能力和用量格式，却不应该直接更新 React 组件。

最外层的 `examples/web` 和 Expo App 负责产品选择：静音多久算结束、回复应该多长、页面怎样显示增量文字、Demo 使用哪组模型。这个边界曾经通过一个很具体的问题得到验证：我要求模型讲一个 500 字故事，结果它只说了几十字。沿着 SDK 查了一圈，答案落在 Web 示例：系统提示明确要求“每次只回复 1–2 个简短句子”，级联模式还设置了 `maxTokens: 80`。这不是 core 故障，而是 example 的语音产品策略。确认这个策略合理后，我没有为了一个测试指令去放宽底层接口。

另一个例子是 OpenRouter。Demo 可以用它接 ASR、LLM、TTS 和 Audio LLM，但 OtterVoice 不应因此变成“OpenRouter SDK”。客户端后来统一访问 `/api/voice`，界面只说明自己连接服务端语音网关；具体 Provider 留在服务端适配器内。浏览器和 App 不保存长期密钥，也不需要知道上游是哪一家。这使得示例可以低成本跑通，同时保留替换区域服务、自建模型或 token broker 的能力。

我起初把 runtime 看成一层很薄的适配：Web 调浏览器 API，Expo 调原生 API，再把字节交给 core 就结束。后来的故障证明这个模型过于简单。实时语音中，平台时序本身就是业务语义。录音器在什么状态、容器是否连续、播放暂停后是否还保留用户开头，都会改变“这段声音属于哪个 turn”。Runtime 的角色也因此被重新定义：它拥有媒体事实。

这条边界也影响测试方式。core 的绝大多数行为可以用确定性的时钟、生成器和 Mock Runtime 验证；真实 WebM、浏览器 autoplay、麦克风 AEC、Expo 音频焦点则必须在对应 runtime 中验证。把所有逻辑写进 `VoiceSession`，单测也许更容易集中，但最终只会制造一个既理解业务又理解每个平台媒体细节的巨型类。

## 二、取消“说完了”按钮，并没有自动得到全双工

最初的 Web 示例每次都需要点击 Done Speaking。改成自动 VAD 后，页面确实能在检测到静音时结束用户回合，再自动进入下一次监听。第一眼看上去，连续对话已经完成：没有按钮，麦克风也会再次打开。

决定性的问题出现在用户说完一句、稍作停顿、模型正在理解的时候。如果用户此时继续补一句，系统没有任何反应。代码路径显示，VAD 判定结束后会先停止录音，再等待批量 ASR 和模型处理；下一路录音要到回复结束后才建立。UI 显示 `processing`，用户也看到麦克风图标，但底层 capture 实际不存在。这是一段完整的失聪窗口。

修复这类问题不能靠缩短静音阈值。阈值只决定旧 turn 何时结束，不会自动创建新 turn。当前处理方式是：先让当前录音器完整封装 WebM，紧接着立即启动下一路 capture；上一轮的 ASR、模型和播放在后台异步收口。新 capture 的所有权先建立，旧 turn 才开始 processing。

![用户停顿后的连续 capture、ASR final 与取消时间线](/images/ottervoice-full-duplex-engineering-retrospective/continuous-turn-timeline.svg)

*Capture N 结束后，Capture N+1 不等待 ASR 或模型；用户在 processing 中再次说话时，旧任务会被取消。*

这要求一次用户轮次不再只是几个局部变量。`TurnCapture` 需要持有 id、音频块、ASR session、最终结果、清理回调、generation、取消信号，以及“下一路录音已经准备好”的 Promise。旧 ASR 可以慢慢完成，但它完成时必须再次确认：这个 capture 仍然有效吗？它的 generation 还是当前的吗？会话是否已经结束？

这里的 generation 很关键。只调用 `audioOutput.stop()` 不能取消已经在网络上生成的回答；只从 UI 删除消息，也不能阻止后台继续消耗 token。用户在 processing 或播放期间重新说话时，core 会取消旧 capture，触发 AbortController 中止上游请求，并递增 generation。即使 Provider 没能及时终止，晚到的文本 delta 和音频 chunk 也会因 generation 不匹配而被忽略，旧回答不会再次出现在页面上。

### Partial 只负责可见性，Final 才拥有结算权

我为输入加入 `asr_partial` 后，曾遇到一个更隐蔽的问题：用户一次发言中自然停顿几次，系统生成了多段 Answer，最终只播放最后一段。从听感上看，最后的回答可能完全正确；从成本和逻辑上看，前面几次模型请求已经发生，只是被后来的输出覆盖了。

最初的怀疑是“每个 partial 都调用了 LLM”。检查后发现 partial 没有直接发请求；抢跑发生在 VAD 检测到一次停顿后：为了压低延迟，Audio LLM 在 ASR final 确认之前就启动了。450ms 左右的自然停顿可能被识别为轮次边界，于是同一句话触发多个付费回答。`asr_partial` 只是让这个问题在界面上更容易被注意到。

修复后，partial 的权限被明确限制：它只能用同一个 `turnId` 更新用户字幕，不能创建模型回答。VAD 结束录音后仍要等 ASR final；只有 final 抵达、capture 仍然有效、可靠语音条件成立时，才能发起一次 LLM 或 Audio LLM 请求。这样会牺牲一点抢跑延迟，但换回了可解释的成本和轮次语义。

输出文字也使用相同原则。`assistant_text_delta` 携带新片段和当前累积全文，Web 与 Expo 都只原位更新同一个 assistant turn。请求被取消后，即使 Provider 继续回调，core 也不会再发出属于旧 generation 的 delta。UI 不需要通过“猜哪一条消息过期”来修复底层竞态。

### 静默也可能制造一个不存在的用户 turn

另一个问题表现为：助手说完后，用户什么都没说，过一会系统却重新回答了上一道问题。对话记录里出现连续两条助手消息，中间没有对应的用户字幕。

检查上下文和事件顺序后，播放尾音被 VAD 当成了新用户轮次。Audio LLM 允许在字幕为空时继续理解原始音频，这本来用于容忍 ASR 偶发失败；但如果所谓“原始音频”只有扬声器残差，模型看到的主要内容就是上一轮上下文，于是自然会继续或重答上一题。

这个问题最终被拆成两道保护。播放结束后，VAD 先重新建立静音基线，消费掉最初几帧尾音；对于播放期间产生的短暂空字幕 turn，还要求存在可靠的语音证据，例如有效 ASR 文本或足够多的 voiced frames。这样不会因为 ASR 暂时为空就丢弃真实的 Audio LLM 问题，也不会让一小段扬声器尾音创建新请求。

## 三、播放期间插话：固定阈值为什么总在两边失败

全双工最难的一部分是 barge-in，也就是助手说话时用户直接插话。最早的实现让播放期间和正常聆听共用同一个音量 VAD。结果很快暴露：敲一下桌面，助手就停止；调高阈值后，欢迎语又无法打断；再过几轮，助手自己的外放声音仍可能持续超过阈值，反而比真人更容易触发。

继续调整某一个阈值无法解决问题。麦克风只能看到混合后的能量：真人语音、扬声器回声、房间反射、自动增益、键盘和桌面敲击都叠在一起。浏览器虽然请求了 `echoCancellation`、降噪和自动增益，但它们在不同设备、音量和播放路径上的效果并不一致。仅比较一个 RMS 数字，没有足够信息回答“是谁在说话”。

我尝试过几轮渐进方案。一版把播放期间的阈值提高，并要求声音持续更久；短促敲击少了，但短词“停”“no”“wait”也变得难以确认。下一版同时分析助手输出包络与麦克风音量，学习“扬声器到麦克风”的回声增益，再从输入中扣掉预计回声。理想同步测试能通过，真实设备却依然没有改善。

于是我增加了离线声学回环脚本，用真实语音波形组合不同延迟、回声增益、噪声、敲击和真人插话。2026 年 7 月 13 日的一次记录中，矩阵一度达到 24/24，但用户实测依旧会在播放十个字左右时停止。“测试环境不同”不足以解释这种稳定复现，测试模型显然缺失了关键变量。

继续回看真实波形后，暴露出两个错误。第一个错误是要求每一帧连续超过阈值；自然语音的音节间有能量谷，计时器会反复清零，而持续回声反而更稳定。第二个错误更隐蔽：某个 50ms 播放帧接近静音时，代码把它当成“播放已经结束”，清空了回声历史。延迟到达的回声随后失去参考，被当成新插话。

又一版修正了播放生命周期和窗口投票，却出现“播放约十个字后停止”。最后发现输出音频已经开始播放，供回声过滤使用的包络仍在异步解码。校准期从播放开始计时，在参考信号尚未到达时就被耗尽；包络就绪后又从第 0 帧开始，与真实播放位置错开。设备解码延迟叠加声学延迟后，相关搜索窗口自然失效。

这些修复让离线模型更接近真实设备。RMS 回声减法依然只能提供辅助证据，无法承担完整的声学回声消除。调研成熟实时语音项目后，我采用了更重要的结构性变化——把“候选插话”和“确认插话”拆开。

![播放期间候选插话、暂停确认、误打断恢复与真实抢话决策树](/images/ottervoice-full-duplex-engineering-retrospective/barge-in-decision.svg)

*第一次命中只暂停播放。暂停后声音消失，说明它大概率来自扬声器；声音仍持续，才确认用户抢话。*

当前流程是：回声过滤和严格 VAD 先产生疑似候选；core 暂停助手播放，但不销毁播放对象，也不立刻结束 assistant turn。暂停后先给扬声器尾音一个衰减窗口，麦克风和 ASR 继续工作。如果输入很快恢复安静，就丢弃这段尾音、进入短暂 cooldown，并从原位置恢复播放。如果声音持续、ASR 给出可靠文本，或累计了足够 voiced frames，才真正切换到 `user_speaking`，取消旧回答。

“先暂停”提供了固定阈值没有的信息：如果声音来自扬声器，它会随着播放暂停而迅速下降；如果是真人，通常还会继续。它不需要一开始就完美区分两种声源，而是主动改变系统状态，创造一个更容易判断的观测窗口。

### 暂停播放不能暂停录音

两阶段确认又引出首字丢失问题。浏览器如果直接调用 `MediaRecorder.pause()`，从疑似候选到最终确认的几百毫秒不会产生编码分片。用户说“停一下”时，等系统确认是真人，前面的“停”已经不在录音里。是否丢失取决于 VAD 确认速度，所以表现为“有时吃字，有时不吃”。

Web runtime 现在采用软暂停：`MediaRecorder` 继续工作，音量监测也持续进行，只是暂缓把编码块交给 core，并在内部保存大约 500ms 的滚动预录。确认抢话前，core 必须先切换到 `user_speaking`，再让 runtime 释放预录；否则同步回放预录时，`shouldForwardAsrAudio()` 仍看到 `assistant_speaking`，用户开头仍会被过滤。

误打断恢复时则走相反路径：丢弃滚动尾音，保留媒体容器所需的首块，重置当前 ASR 音频，再恢复助手播放。这个顺序同时服务两条目标——真实插话不丢首字，自身回声不进入下一轮字幕。

声学快速路径本身不区分语言。中文单字“停”、英文单词“no”或“wait”都可以依靠持续前景语音确认；文本路径只是附加证据，而不是把某种语言的“至少两个字”硬编码进 core。单个孤立拉丁字母仍可作为噪声过滤，因为它更像不稳定 ASR 的片段，而不是完整打断指令。

## 四、Answer 正常、Ask 为空：问题不一定在模型

一个最容易误导排查方向的故障是：助手回答完全符合预期，用户字幕却不显示。既然 Audio LLM 能听懂，直觉会把问题指向 ASR 模型、Provider 参数或页面渲染。真实根因却位于 WebM 容器连续性。

浏览器 `MediaRecorder` 每隔约 100ms 产生一个 WebM/Opus 分片，但首个分片通常承载容器头。助手播放期间，为了避免把扬声器声音送给字幕 ASR，旧实现过滤了所有录音块，连首个容器头也一起删除。进入 listening 后，ASR 收到的只是无头的后续字节。上游有时仍能统计出两秒音频并产生用量，却无法解出有效语音；Audio LLM 使用另一份完整录音，因此 Answer 看起来一切正常。

我一度尝试只保留首块、删除播放期间的中间块、再拼接用户分片。真实 Chrome 验证表明，这种组合依旧可能触发 `Unable to decode audio data`。WebM 需要连续的内部结构，不能按“一个头加任意后续 payload”重新拼装；删除中间块后，时间戳和簇边界不再连续。

另一个独立问题发生在 `stop()`。MediaRecorder 停止时会再发出最终 `dataavailable`，而 `Blob.arrayBuffer()` 也是异步的。如果 `stop()` 只等待状态变化，不等待最后事件和所有 pending buffer 转换，交给 `decodeAudioData()` 的数据就可能少一个尾块。这解释了同一段逻辑为何在单元测试中稳定，在真实浏览器中却间歇失败：测试桩通常同步返回最后分片。

![WebM 输入容器连续性与 Audio LLM SSE 输出对齐](/images/ottervoice-full-duplex-engineering-retrospective/media-stream-boundaries.svg)

*输入端必须等待完整容器并识别真实字节；输出端必须跨 SSE 事件保存 Base64 与 PCM16 的余量。*

当前 Web runtime 会在停止时等待最终 `dataavailable` 和所有 `arrayBuffer()` 完成。软暂停期间，若录音尚未向 core 交付过数据，runtime 会单独保留首个容器块；确认抢话时再按顺序释放容器头与预录。Provider 上传前也会检查真实 magic bytes，识别 WebM、WAV、Ogg/Opus 或 MP3，而不是盲信跨平台配置中的 `encoding: pcm_s16le`。否则实际 WebM 可能被错误地再包一层 WAV。

### 413 是另一种媒体边界失配

截图中还出现过 Vercel `FUNCTION_PAYLOAD_TOO_LARGE`。浏览器原本把 Opus 解码成原采样率的单声道 WAV，常见情况下是 48kHz、16-bit；随后又将 WAV 做 Base64 并放进 JSON。47 秒原始 PCM 已接近 4.5MB，Base64 还会再膨胀约三分之一，很容易越过当时 Vercel Function 的请求体限制。[Vercel 的说明](https://examples.vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)也建议避免把大文件直接塞进函数请求体。

修复放在浏览器边界：语音输入降采样到 16kHz 单声道，并给单轮音频设置明确上限。90 秒、16kHz、16-bit 的 PCM 约 2.88MB，Base64 后约 3.84MB，能够给 JSON 字段和上下文留下余量。更长的生产音频仍应该采用直接上传或流式存储，而不是继续提高客户端上限。

这个问题与模型质量无关，却会在“转写完成、回复生成之前”表现成模型没有响应。它提醒我：语音链路的每个序列化步骤都要重新计算体积，压缩录音、解码后的 PCM、WAV 头、Base64 和 JSON 不是同一种成本。

## 五、Audio LLM 更快，但流式协议必须一直延伸到扬声器

OtterVoice 同时保留两条通路。传统级联是 ASR → 文本 LLM → TTS，优势是每一段都可以独立替换、观察和计费；Audio LLM 则直接接收语音并生成语音，字幕 ASR 只在旁路工作。后者减少了串行阶段，但如果实现仍然等 SSE 全部结束、合成完整 WAV 后才播放，模型的流式能力并不会自动变成更快的听感。

仓库中的 `examples/web/benchmark.ts` 用同一段输入、默认三轮，分别测量级联链路和 Audio LLM 链路，并记录 ASR、LLM、TTS、首个音频和完整音频时间。历史会话里曾出现具体倍数，但没有保存与当前提交对应的原始结果，因此这里不把它们写成项目结论。可重复的测量方法比一次漂亮数字更重要，尤其是模型、区域、网络和缓存都会变化。

Audio LLM 的 SSE 事件中包含 Base64 音频片段，但传输事件边界不是 Base64 边界。一个事件结尾可能停在不足四个字符的位置；解码后的 PCM16 又要求每个采样占两个字节。若把每个事件单独解码并播放，会遇到无效 Base64、半个采样或分片间断音。

Provider 因此维护两类 carry：不足四字符的 Base64 余量，以及一个无法组成 PCM16 采样的奇数字节。只有完整双字节采样才通过 `onAudioChunk` 交给 core。首个有效 chunk 抵达时，core 创建 `startPcmStream`，切到 `assistant_speaking` 并发出 `assistant_audio_start`；Web Audio 把后续 chunk 沿同一时间轴排队。完整 WAV 仍然保留给调试按钮和不支持 PCM 流的回退路径，但不再是首播前置条件。

文本也在同一请求里增量返回。Provider 的 transcript delta 进入 `assistant_text_delta`，页面按 turnId 原位更新；如果用户打断，PCM 队列、网络请求和文本 delta 必须由同一个 capture 取消。只停止扬声器会产生“听不到旧回复，但后台仍在生成”的假取消。

## 六、跨端复用的是契约，不是浏览器代码

Web 通路稳定后，我把 Audio LLM 扩展到 React Native / Expo。移动端不能直接搬用 `MediaRecorder` 或 Web Audio，但可以复用同一个 VoiceSession 契约。Expo runtime 使用 16kHz、单声道、int16 PCM 持续输入；播放端把 PCM chunk 写成短 WAV 文件并交给 AudioPlaylist 排队。Core 仍然只看到 AudioInputAdapter、AudioOutputAdapter、turn 事件和取消能力。

这也解释了为何 runtime 必须独立。Web 上需要关心 WebM 容器头、autoplay 用户手势和 AudioContext 调度；Expo 上需要关心麦克风权限、音频模式、播放列表、缓存文件和原生模块版本。它们共享的是“录音开始与结束”“分片如何交付”“播放如何暂停、恢复与停止”这些契约，不是同一份平台代码。

模拟器联调曾经停在 Expo Go 首页、Metro 无法连接、依赖版本与 SDK 矩阵不一致，以及系统语言明明是中文、应用却默认英文。这些问题没有一个应该进入 core。示例项目需要固定 Expo 兼容依赖，使用设备语言 API，配置 EAS 构建镜像，并通过 Provider 无关的线上 `/api/voice` 网关连接 Demo 服务。SDK 只提供可组合能力，示例负责把它变成能扫码和编译的产品入口。

安全边界同样跨端一致。Web bundle、App 二进制和 `EXPO_PUBLIC_*` 变量都不应包含长期 Provider 密钥。当前 Demo 请求 [ottervoice.vercel.app](https://ottervoice.vercel.app) 的服务端语音网关，由服务端选择 Provider。生产使用者可以替换成自己的网关或短期 token broker，而不需要改动 VoiceSession。

## 七、为什么“测试全绿”仍可能不够

OtterVoice 初始 core 曾以 100% 行和函数覆盖率作为门槛，这对状态迁移、错误归一化和取消分支非常有效。但真实媒体问题反复提醒我：测试定义证明的是某个模型下的行为，不是物理世界已经被覆盖。

例如，最早的抢话测试使用平滑常数模拟人声和回声，因此连续阈值看起来可靠；换成真实语音波形后，音节间的能量谷立即打破假设。离线回环能够组合 0–300ms 延迟、不同回声增益、敲击和真人插话，却仍无法复现具体设备的扬声器频响、房间反射、浏览器 AEC、自动增益和异步包络解码。

浏览器自动化也有边界。内置浏览器和受控 Chrome 可能因为 autoplay 或麦克风用户手势策略拒绝真实扬声器—麦克风回环。此时最危险的做法是把单元测试或合成音轨包装成“实机已通过”。更诚实的交付应该写清楚：哪些是状态机测试，哪些使用真实 MediaRecorder，哪些只是离线波形，哪些必须由人在真实设备上试听。

这次历史里最有价值的测试结果，反而是一组假绿：离线矩阵通过后，用户仍然稳定复现助手自停。它迫使我从“继续改善回声估算”转向“两阶段暂停确认”。测试不再只负责证明实现正确，也负责暴露我们到底假设了什么。

## 八、我现在怎样定位一个语音故障

回到最开始的三层框架，我会先根据症状确定哪一层拥有缺失的知识，而不是从最新修改过的文件开始猜。

| 症状 | 优先检查 | 要问的问题 |
| --- | --- | --- |
| processing 期间继续说话无响应 | Core / Runtime | 新 capture 是否已在旧 ASR 完成前建立？ |
| 多段 Answer 只播放最后一段 | Core | partial、VAD end、final 中是谁创建了模型请求？ |
| 静默后重复回复上一题 | Core / Runtime | 播放尾音是否生成了一个空用户 turn？ |
| 敲击或自回声让助手停止 | Core / Runtime | 候选是否直接被当成确认？暂停后声音是否消失？ |
| 插话开头偶尔被吃掉 | Runtime | VAD 确认期间是否仍保留编码预录？ |
| Answer 正常但 Ask 为空 | Runtime / Provider | ASR 是否拿到连续、带容器头的真实 WebM？ |
| `decodeAudioData` 间歇失败 | Runtime | 是否等待最终 dataavailable 和 arrayBuffer？ |
| 长语音出现 HTTP 413 | Example / Gateway | 解码、Base64、JSON 后的体积分别是多少？ |
| SSE 已返回但迟迟不播放 | Provider / Runtime | 音频分片是否跨事件对齐并立即进入播放队列？ |
| Web 正常、Expo 不工作 | Runtime / Example | 平台权限、格式和播放能力是否被错误假设为相同？ |

我还会固定问四个问题：这段声音属于哪个 turn？谁有权取消它？哪一层知道它的真实编码？partial、final 和付费请求是不是同一件事？如果这四个问题没有唯一答案，系统迟早会用竞态替我们作答。

截至 2026 年 7 月 14 日，`main` 与远端指向提交 `2d405a9`，增量字幕事件和网站工程文档已经进入版本历史；WebM 真实容器识别、抢话预录、上游请求取消等最新修复仍存在于 19 个未提交文件中。因此本文描述的是当前实现与演进方向，不把这些本地改动声称为已经发布。当前测试总数和线上部署状态也没有被这篇文章升级成未经验证的结论。

做完这一轮，我对“全双工”的理解已经变了。它不是一个开关，也不是一组更激进的 VAD 参数，而是一份持续有效的所有权协议：每段音频有明确的 turn，每个异步任务有明确的取消者，每种媒体格式只由真正理解它的层处理。只有这些答案稳定下来，语音对话才会从一个能演示的页面，变成一套能够继续演进的基础设施。

如果你想直接阅读实现，可以从 [OtterVoice 仓库](https://github.com/bugkiwi/OtterVoice) 开始；如果想先感受字幕、播放和抢话之间的关系，可以打开 [在线 Demo](https://ottervoice.vercel.app)。
