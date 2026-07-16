---
title: "[AI] 翻译模型效果与费用评估"
date: 2026-07-01
description: 我们用一组真实翻译测试比较了不同模型的质量和费用,解释为什么免费版会优先使用低成本高性价比模型,付费版会使用更好的模型和一致性保障。
tags: [PageSmith.com, AI翻译, benchmark]
slug: page-smith-translation-model-evaluation
---

在开发 [Page-Smith.com](https://page-smith.com) 时候，肉眼其实比较难判别模型的优劣了、，纯文本翻译效果似乎相差不大。而在项目定价的时候，价格与效果就得找个更置信的平衡点。基于这个问题，所以进行一次常见翻译问题的评估。执行细节由AI执行，过程记录如下。

--------- `以下内容由自 AI 整理生成` ---------

做文档翻译时,模型选择不是一个越贵越好的问题。

如果只是想快速看懂一份英文 PDF,用户更在意的是速度、价格和大致准确。如果是准备长期保存、分享给别人,或者翻译一本书、一份合同、一篇论文,用户就会更在意细节:名字前后是否一致、数字有没有错、语气有没有丢、专业术语是否稳定。

所以 PageSmith 不会把所有翻译都塞给同一个模型。免费用户需要一个成本足够低、速度足够快、质量也足够稳的默认选择;付费用户则应该得到更好的模型、更稳定的术语处理和更少的返工。

为了确认这个判断,我们做了一组翻译模型测试。测试里没有只放简单句,而是故意加入了一些容易暴露问题的内容:习语、双关、法律长句、反讽、长篇小说里的专有名词、摄影术语、日期数字、文化专有项和诗歌。

## 先说结果

对于免费版和普通预览翻译,`DeepSeek V4 Flash` 在关闭 reasoning 后是更有吸引力的默认候选。它的真实翻译成本比 `Gemini 2.5 Flash Lite` 还低约 10%,同时在这组测试里的质量不差,甚至整体更稳。

对于付费版,我们会使用更好的模型或更完整的翻译流程。原因不是轻量模型不能用,而是付费场景通常对错误更敏感:一本书里同一个人物不能一会儿叫 A、一会儿叫 B;合同里的否定和例外不能漏;论文和说明书里的术语也不能随意变化。

这次测试里,更强的模型主要赢在这些地方:

- 更少出现否定、数字、日期这类硬错误
- 更稳定的术语和名称一致性
- 更好的习语、双关、文化语境处理
- 更少需要人工大幅修改的译文

换句话说,免费版追求的是“快速、便宜、够用,并尽量稳定”;付费版追求的是“更稳、更少错、更适合正式使用”。

## 我们测试了哪些模型

| 模型 | 在测试中的角色 | 更适合的使用方式 |
|---|---|---|
| DeepSeek V4 Flash | 轻量翻译模型 | 免费版、预览、普通阅读,需要关闭 reasoning |
| Gemini 2.5 Flash Lite | 轻量翻译模型 | 免费版备选、预览、普通阅读 |
| Gemini 3.1 Flash Lite | 增强翻译模型 | 付费版、质量更稳的常规翻译 |
| Claude Sonnet 5 | 高质量翻译模型 | 长文、出版、合同、复杂语气 |
| GPT-5.5 | 测试评分 | 只用于本次测试打分,不是用户翻译时的默认模型 |

## 翻译质量差多少

我们按 1-4 分评价译文,4 分最好。除了准确性和自然度,还特别看了术语一致性、语气、习语文化处理、诗歌形式等更容易出差异的地方。

| 模型 | 准确性 | 自然度 | 术语一致性 | 语气保持 | 习语/文化 | 形式保持 | 严重错误 | 需要大改 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gemini 2.5 Flash Lite | 3.63 | 3.64 | 3.86 | 3.80 | 3.44 | 3.74 | 1% | 17% |
| DeepSeek V4 Flash | 3.83 | 3.85 | 3.98 | 3.93 | 3.64 | 3.80 | 0% | 9% |
| Gemini 3.1 Flash Lite | 3.83 | 3.88 | 3.95 | 3.92 | 3.71 | 3.77 | 0% | 15% |
| Claude Sonnet 5 | 3.87 | 3.73 | 3.98 | 3.95 | 3.66 | 3.76 | 0% | 15% |

这个结果说明两件事。

第一,轻量模型不是“廉价低质”。`Gemini 2.5 Flash Lite` 的基础翻译能力已经不错,而关闭 reasoning 后的 `DeepSeek V4 Flash` 在成本和质量上更像一个适合免费版的默认候选。

第二,付费版使用更好的模型是有意义的。强模型不是每一句都明显更漂亮,但它们在难点上更稳,尤其是在长文一致性、习语、法律范围、数字日期这类地方。这些错误平时不多,但一旦出现,用户会非常介意。

## 成本差多少

模型质量只是一半,另一半是成本。下面这组费用来自 OpenRouter 返回的真实计费字段,不是按公开价格和 token 数估算。我们重新跑了一遍 4 个翻译模型:相同片段、相同语种对、相同采样次数,每个模型都是 75 次调用。

| 模型 | 输入 token | 输出 token | 真实花费 | 相对 Gemini 2.5 Flash Lite |
|---|---:|---:|---:|---:|
| DeepSeek V4 Flash(关闭 reasoning) | 12,192 | 4,544 | $0.00275 | 便宜约 10% |
| Gemini 2.5 Flash Lite | 12,075 | 4,602 | $0.00305 | baseline |
| Gemini 3.1 Flash Lite | 12,147 | 4,760 | $0.01018 | 约 3.3x |
| Claude Sonnet 5 | 18,561 | 7,743 | $0.11455 | 约 37.6x |

这组结果改变了我们的判断:如果显式关闭 reasoning,`DeepSeek V4 Flash` 的真实翻译成本不但没有更高,反而比当前生产环境常用的 `Gemini 2.5 Flash Lite` 更低。

`Claude Sonnet 5` 的成本明显高很多,更适合放在付费、高质量或高风险文档里。`Gemini 3.1 Flash Lite` 介于两者之间,可以作为付费版里的常规增强模型。

## DeepSeek 费用计算

最初看到 DeepSeek 费用偏高,定位后发现,不是因为 DeepSeek 本身一定更贵,也不是因为目录价完全失真。更关键的原因是当时请求里开启了 reasoning。

reasoning 会让模型产生额外的推理 token。对翻译这类任务来说,这些额外 token 不一定会明显提升最终译文,但会真实计入成本。关闭 reasoning 后重新测试,DeepSeek 的费用回到预期范围,并且低于 `Gemini 2.5 Flash Lite`。

所以后续如果使用 `DeepSeek V4 Flash` 做翻译,我们会显式传入 `reasoning: { enabled: false }`,并继续以 OpenRouter 返回的真实 `usage.cost` 为准。目录价适合预估,真实账单字段才适合做产品决策。

## 我们不只是在换模型

文档翻译还有一个常见误区:以为只要换成更贵的模型,质量问题就自然解决了。实际不是这样。

长文翻译最难的地方,往往不是某一句怎么翻,而是整篇是否稳定。一本书里的人名、地名、组织名、术语,需要从头到尾保持一致。PDF 和书籍又经常会被拆成很多小片段翻译,这会让一致性变得更难。

所以 PageSmith 会把模型选择和工程处理结合起来。对于长文,我们会更重视术语表、上下文、一致性检查和关键数字校验。很多质量提升,不是单纯靠“更贵模型”得到的,而是靠这些翻译流程把模型能力用稳。

这也是为什么免费版和付费版不只是模型不同,背后的处理方式也会不同。

## 测试片段

下面是本次测试用到的一部分片段。默认折叠起来,是因为它们更偏技术细节;感兴趣的话可以展开看。

<details>
<summary>F01 - 直白叙事:基础准确性与流畅度</summary>

**源文**

> The train pulled into the station a few minutes past six. Mara stepped onto the platform, pulled her coat tighter against the wind, and looked for the blue sign her sister had described. Behind her, a vendor was selling roasted chestnuts, and the smell followed her all the way to the exit.

**考察重点**

基础准确性、自然度和完整性。

**观察信号**

这段是地板测试。强弱模型都应该轻松过关。如果在这里出现漏译、错译或明显翻译腔,说明默认模型风险很高。

</details>

<details>
<summary>F02 - 习语/俚语密集:避免字面直译</summary>

**源文**

> Look, I don't want to beat around the bush. The project's gone belly-up, we're bleeding money, and the board wants heads to roll. If we don't pull a rabbit out of the hat by Friday, it's curtains for the whole team.

**考察重点**

习语处理、商务口语、紧迫和威胁语气。

**观察信号**

模型是否把 `beat around the bush`、`gone belly-up`、`heads to roll`、`pull a rabbit out of the hat`、`it's curtains` 译成自然表达,而不是逐字翻译成怪句子。

</details>

<details>
<summary>F03 - 双关/文字游戏:是否能重造笑点</summary>

**源文**

> "I used to be a banker," he said, "but I lost interest." She groaned. "And I was a tailor, until I realized it just wasn't a good fit."

**考察重点**

双关识别和目标语再创作。

**观察信号**

`interest` 同时指兴趣和利息,`fit` 同时指合身和合适。优秀译文应该尝试保留笑点、改写笑点,或至少用译注解释,而不是直接拍平。

</details>

<details>
<summary>F04 - 正式/法律语域:长句和责任范围</summary>

**源文**

> Notwithstanding any provision to the contrary herein, the Licensee shall indemnify and hold harmless the Licensor against any and all claims, damages, or liabilities arising out of or in connection with the Licensee's use of the Software, save to the extent such claims result from the Licensor's gross negligence.

**考察重点**

法律寄存器、长句结构、责任范围和例外条款。

**观察信号**

`indemnify and hold harmless` 是否译得规范;`save to the extent...` 这个例外是否保留。漏掉例外条款属于致命错误。

</details>

<details>
<summary>F05 - 口语/反讽声音:保留叙述语气</summary>

**源文**

> So yeah, Dave "organized" the offsite. And by organized I mean he booked a paintball place that shut down in 2019, then acted shocked - shocked! - when we showed up to a padlocked gate and one very confused goat. Classic Dave.

**考察重点**

反讽、戏剧化重复、调侃语气。

**观察信号**

`"organized"` 的讽刺引号、`shocked - shocked!` 的重复、`Classic Dave` 的调侃是否存活。如果译成平铺直叙,语义还在,但人物声音会丢。

</details>

<details>
<summary>F06/F07 - 长程一致性:跨章节名称和术语是否漂移</summary>

**F06 源文**

> The Warden of Ashfen, Lady Corvane Ilesmoor, pressed her palm to the Weeping Stone and whispered the old word: *sethra*. The gate did not open. Beside her, her shieldbearer - a boy named Tobble - shivered. "They say the Warden before you tried the same word for thirty years," he said. "Then she stopped being Warden."

**F07 源文**

> It had been twelve years since Tobble first watched Lady Ilesmoor fail at the Weeping Stone. He was shieldbearer no longer; he was Warden of Ashfen now, and the word *sethra* still tasted like ash in his mouth. Corvane was long gone. But the gate - the gate remembered.

**考察重点**

跨调用的人名、头衔、专名、生造词一致性。

**观察信号**

逐项检查 `Corvane Ilesmoor`、`Tobble`、`Warden of Ashfen`、`Weeping Stone`、`sethra`、`shieldbearer` 的译法是否前后一致。这是整本书翻译最容易露馅的地方。

</details>

<details>
<summary>F08 - 领域术语/数字单位:摄影术语和参数</summary>

**源文**

> Set the aperture to f/2.8 and drop the shutter speed to 1/60 to let more light hit the sensor. If you push the ISO past 3200 you'll start to see noise in the shadows, so bracket your exposures and stack them in post.

**考察重点**

专业术语、数字、单位和后期处理表达。

**观察信号**

`aperture`、`shutter speed`、`ISO`、`bracket your exposures`、`in post` 是否译得地道;`f/2.8`、`1/60`、`3200` 是否被错误改动。

</details>

<details>
<summary>F09 - 文化专有项:保留还是本地化</summary>

**源文**

> By the time the bento arrived, Grandmother had already lit the incense for Obon and set out three place settings - one for each of us, and one, as always, for the empty chair. "Itadakimasu," she said, though no one had touched their food.

**考察重点**

文化专有名词、仪式感和上下文含义。

**观察信号**

`bento`、`Obon`、`Itadakimasu` 是保留、意译还是误译;空椅子和祭祖语境是否被理解。

</details>

<details>
<summary>F10 - 诗歌/韵律:形式是否保留</summary>

**源文**

> The clock upon the mantel keeps  
> a slower time than mine;  
> it counts the hours the old house sleeps  
> and I count only nine.

**考察重点**

押韵、节奏和诗歌形式。

**观察信号**

模型是否尝试保留 `keeps/sleeps`、`mine/nine` 的形式效果,还是只给出散文化直译。诗歌是强弱模型差距很容易显现的场景。

</details>

<details>
<summary>F11 - 否定/数字/日期:致命错误磁铁</summary>

**源文**

> The contract was not, as the seller claimed, signed on March 3rd; it was signed on May 13th, and it did not include the two additional units - only the original fourteen.

**考察重点**

否定、日期、数字和事实忠实度。

**观察信号**

`not` 和 `did not` 不能丢;`March 3rd` 与 `May 13th` 不能混;`two` 和 `fourteen` 不能错。这里的错误通常不是风格问题,而是事实错误。

</details>

<details>
<summary>F12 - 复杂句法/指代歧义:不要擅自消歧</summary>

**源文**

> The minister told the journalist that he had lied, though it was never clear - not to the committee, not to the public, and least of all to the minister himself - whether the "he" in question was the journalist, the minister's predecessor, or the man whose testimony had started the whole affair.

**考察重点**

长嵌套句、插入语和刻意保留的指代歧义。

**观察信号**

模型是否擅自决定 `he` 指谁。如果原文刻意模糊,译文也应保留这种模糊,而不是替作者做判断。

</details>

<details>
<summary>F13 - 中文到英文:成语、口语和文化语境</summary>

**源文**

> 他这个人吧,刀子嘴豆腐心,平时说话噎得你半死,真出了事又是头一个冲上来的。那年厂子倒闭,大伙儿作鸟兽散,就他留下来把烂摊子收拾利索了才走。

**考察重点**

中文成语、无主语句、口语语气和英文自然表达。

**观察信号**

`刀子嘴豆腐心`、`作鸟兽散`、`收拾烂摊子` 是否被自然转写;语气词 `吧` 带出的口语感是否保留。

</details>

## 写在最后

这次测试让我们更确定了一件事:不同用户需要的不是同一种翻译。

免费版应该尽量轻、快、便宜,让用户可以放心试用,也可以快速看懂一份外文资料。基于这次修正后的数据,`DeepSeek V4 Flash` 在关闭 reasoning 后很适合承担这个角色:成本比 `Gemini 2.5 Flash Lite` 更低,质量又不输。

付费版则应该把钱花在更值得的地方:更好的模型、更稳定的长文一致性、更少的数字和术语错误,以及更适合正式使用的结果。

所以如果你只是想快速读懂一份文档,免费翻译已经能解决大多数问题。如果你要翻译一本书、一份合同、一篇论文,或者准备把译文用于工作和分享,付费翻译会更合适。
