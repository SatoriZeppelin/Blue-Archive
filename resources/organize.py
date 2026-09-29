from pathlib import Path

from huggingface_hub import CommitOperationAdd, CommitOperationCopy, HfApi

repo_id = 'think-denim-frisk/BlueArchive'
root = Path(__file__).resolve().parent
api = HfApi()
files = api.list_repo_files(repo_id)
operations = []
mapping = {}

for source in files:
    if source.startswith('start-screen/') and not source.startswith('start-screen/page/'):
        remainder = source.removeprefix('start-screen/')
        name = Path(remainder).name
        if remainder.startswith('audio/bgm/'):
            category = 'BGM'
        elif remainder.startswith('audio/sfx/'):
            category = '音效'
        elif remainder.startswith('audio/voice/'):
            category = '语音'
        elif name == 'title-poster.jpg':
            category = '背景'
        elif remainder.startswith('video/'):
            category = '视频'
        else:
            category = '其他'
        target = f'resources/{category}/{name}'
        if target not in files:
            operations.append(CommitOperationCopy(src_path_in_repo=source, path_in_repo=target))
        mapping[source] = target
    elif source == 'story/characters/Rin_00.png':
        target = 'resources/立绘/Rin_00.png'
        if target not in files:
            operations.append(CommitOperationCopy(src_path_in_repo=source, path_in_repo=target))
        mapping[source] = target

for category in ('CG', '背景', '视频'):
    for file in (root / category).iterdir():
        if file.is_file():
            target = f'resources/{category}/{file.name}'
            if target not in files:
                operations.append(CommitOperationAdd(path_in_repo=target, path_or_fileobj=str(file)))

print(f'Files to categorize: {len(mapping)}, operations: {len(operations)}', flush=True)
if operations:
    result = api.create_commit(
        repo_id=repo_id,
        operations=operations,
        commit_message='Organize Blue Archive prologue CGs, backgrounds, portraits and audio',
    )
    print(f'Commit: {result.commit_url}', flush=True)

for source, target in mapping.items():
    print(f'{source} -> {target}')
