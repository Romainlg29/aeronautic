import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FC } from "react";
import { ExampleFrame } from "./example-frame";
import type { ExampleName } from "./live";

/**
 * An example's source, as it is in examples/.
 * @param file Its file name
 * @returns The text
 */
const read_example = (file: string): Promise<string> =>
  readFile(join(process.cwd(), "examples", file), "utf8");

/**
 * A live example, with its own source behind a tab.
 * @param props Which example
 * @returns The example
 */
export const Example: FC<{ name: ExampleName }> = async ({ name }) => {
  const file = `${name}.tsx`;
  const code = await read_example(file);

  return (
    <ExampleFrame
      name={name}
      file={file}
      code={
        <ServerCodeBlock
          code={code}
          lang="tsx"
          codeblock={{ className: "my-0 rounded-none border-0" }}
        />
      }
    />
  );
};

/**
 * One file of examples/, highlighted.
 * @param props Its file name
 * @returns The code block
 */
export const Source: FC<{ file: string }> = async ({ file }) => (
  <ServerCodeBlock
    code={await read_example(file)}
    lang="tsx"
    codeblock={{ title: file }}
  />
);
