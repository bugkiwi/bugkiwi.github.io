---
title: Mac命令行合并硬盘
date: 2018-02-27
description: Mac 256G 硬盘之前拆了 50G 给 Win10，主盘满了想合回去，磁盘工具搞不定，改用命令行。
tags: [mac, 命令行]
---

Mac 256G 硬盘，之前拆了 50G 给了 Win10，结果呢主盘满了，就想着把这 50G 给合进去。

最初简单的打算通过 `磁盘工具` 操作一下，但是总爆出：分片太小 / 分片检查各种问题。先看现在的分片：

```text
// sudo diskutil list

/dev/disk0 (internal, physical):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:      GUID_partition_scheme                        *251.0 GB   disk0
   1:                        EFI EFI                     209.7 MB   disk0s1
   2:                  Apple_HFS Macintosh HD            200.1 GB   disk0s2
   3:                 Apple_Boot Recovery HD             650.0 MB   disk0s3
   4:                  Apple_HFS                         16.8 MB    disk0s4
   5:                  Apple_HFS win7                    49.4 GB    disk0s5
   6:           Windows Recovery                         483.4 MB   disk0s6
```

其中 `disk0s4`、`disk0s5`、`disk0s6` 是松散的分区，需要和入 `disk0s2` 分区。

首先是分区 `格式化`，上面 list 是已经格式化过的，使用如下命令：

```bash
diskutil eraseVolume HFS+J win8 /dev/disk0s4
diskutil eraseVolume HFS+J win8 /dev/disk0s5
diskutil eraseVolume HFS+J win8 /dev/disk0s6
```

此处注意格式化为：`HFS+J`，为 `Mac OS 扩展（日志式）`，和主文件格式一样。

然后将 `disk0s4` 和 `disk0s5` 合在一起（如果使用 `磁盘工具` 和入的话，`disk0s4` 只有 16M，太小了，会直接报异常）。

注意此时会格式化两块分片。

```bash
diskutil mergePartitions HFS+J win7 disk0s4 disk0s5
```

然后通过 `磁盘工具`，将更新的 `disk0s4` 通过 `分区` 合入到主分区上。

---

说点不好的，忘记合入 `disk0s6`，此时通过 `磁盘工具` 无法合入（分片太小），但是通过 `diskutil mergePartitions` 的话，应该会格式化主磁盘，索性比较小，就先放了吧。

---

在看『老炮儿』，老规矩也好，新规矩也好，一旦定了，那就得按这个来。
