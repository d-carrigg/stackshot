// Pre-built starter compositions surfaced via the Templates modal.
// Each template returns a fresh Composition; image-bearing templates
// generate or fetch their image blobs lazily so the bundle stays small
// for users who never open the modal.
import gifUrl from "../../docs/img/print_loop.gif?url";
import {
  type Composition,
  type ImagePanel,
  emptyComposition,
  makeCodePanel,
  makeImagePanel,
} from "./state";
import { nextBlobId, putBlob, resolveBlobUrl } from "./storage/blobStore";

export type TemplateId =
  | "code-to-code"
  | "code-to-image"
  | "code-to-gif"
  | "image-vs-image"
  | "grid-pipeline";

export type Template = {
  id: TemplateId;
  label: string;
  description: string;
};

export const TEMPLATES: Template[] = [
  {
    id: "code-to-code",
    label: "Code → Code",
    description: "Show input and the resulting output side by side. Good for REPL-style snippets.",
  },
  {
    id: "code-to-image",
    label: "Code → Image",
    description: "Pair code with a screenshot of what it produces. Drop your own image into the placeholder.",
  },
  {
    id: "code-to-gif",
    label: "Code → GIF",
    description: "Show motion — an animated GIF next to the code that produced it.",
  },
  {
    id: "image-vs-image",
    label: "This vs That",
    description: "Compare two images side by side with a VS badge between them. Drop your own screenshots in.",
  },
  {
    id: "grid-pipeline",
    label: "Numbered pipeline",
    description: "A numbered 2×2 grid that walks a load → aggregate → fit → forecast flow, with arrows linking each step.",
  },
];

const PYTHON_DEMO = {
  code: "nums = [1, 2, 3, 4, 5]\nsquares = [n ** 2 for n in nums]\nprint(squares)\n",
  language: "python",
  title: "input",
};

const PRINT_LOOP_DEMO = {
  code:
    "import time\n" +
    "\n" +
    "for i in range(1, 11):\n" +
    "    print(f\"Hello {i}\", flush=True)\n" +
    "    time.sleep(0.5)\n",
  language: "python",
  title: "input",
};

// Render a friendly placeholder so the image template still looks like
// something instead of a broken icon. Subtle "drop your image" hint so
// the user knows to swap it.
const buildPlaceholderImagePanel = async (): Promise<ImagePanel> => {
  const W = 720;
  const H = 360;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1e1e2e";
  ctx.fillRect(0, 0, W, H);

  // Dashed outline for "drop target" feel
  ctx.strokeStyle = "#7f849c";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(20, 20, W - 40, H - 40);
  ctx.setLineDash([]);

  ctx.fillStyle = "#cdd6f4";
  ctx.font = "600 28px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Drop or paste an image here", W / 2, H / 2 - 16);
  ctx.fillStyle = "#7f849c";
  ctx.font = "16px Inter, sans-serif";
  ctx.fillText("png · jpeg · webp · avif", W / 2, H / 2 + 18);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
    ),
  );
  const blobId = nextBlobId();
  await putBlob(blobId, blob);
  const url = (await resolveBlobUrl(blobId)) ?? "";
  return makeImagePanel(url, W, H, undefined, {
    blobId,
    mime: "image/png",
    animated: false,
  });
};

// Fetch the bundled print_loop.gif, stash it in IndexedDB, return the
// hydrated panel.
const buildBundledGifPanel = async (): Promise<ImagePanel> => {
  const res = await fetch(gifUrl);
  const blob = await res.blob();
  const blobId = nextBlobId();
  await putBlob(blobId, blob);
  const url = (await resolveBlobUrl(blobId)) ?? "";
  // Decode dimensions
  const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
  return makeImagePanel(url, dims.w, dims.h, undefined, {
    blobId,
    mime: "image/gif",
    animated: true,
  });
};

export const buildTemplate = async (id: TemplateId): Promise<Composition> => {
  if (id === "code-to-code") {
    return {
      ...emptyComposition(),
      panels: [
        makeCodePanel(PYTHON_DEMO),
        makeCodePanel({
          code: "[1, 4, 9, 16, 25]\n",
          language: "text",
          title: "output",
        }),
      ],
      selectedId: null,
    };
  }
  if (id === "code-to-image") {
    const code = makeCodePanel({
      ...PYTHON_DEMO,
      code:
        "df = pd.DataFrame({\n" +
        '    "name": names,\n' +
        '    "value": values,\n' +
        "})\n" +
        "df.head()\n",
      title: "input",
    });
    const image = await buildPlaceholderImagePanel();
    return {
      ...emptyComposition(),
      panels: [code, image],
    };
  }
  if (id === "grid-pipeline") {
    const cell = (
      title: string,
      code: string,
      gridRow: number,
      gridCol: number,
    ): Composition["panels"][number] => ({
      ...makeCodePanel({ title, code, language: "python" }),
      gridRow,
      gridCol,
    });
    const load = cell(
      "Load",
      'import pandas as pd\n\n' +
        'df = pd.read_csv("sales.csv")\n' +
        'df = df.dropna(subset=["date", "revenue"])\n',
      0,
      0,
    );
    const aggregate = cell(
      "Aggregate",
      'df["month"] = pd.to_datetime(\n' +
        '    df["date"]\n' +
        ').dt.to_period("M")\n\n' +
        'monthly = df.groupby("month")["revenue"].sum()\n',
      0,
      1,
    );
    const fit = cell(
      "Fit",
      "from sklearn.linear_model import LinearRegression\n\n" +
        "X = [[i] for i in range(len(monthly))]\n" +
        "model = LinearRegression().fit(X, monthly.values)\n",
      1,
      0,
    );
    const forecast = cell(
      "Forecast",
      "next_month = [[len(monthly)]]\n" +
        "pred = model.predict(next_month)[0]\n" +
        'print(f"Next month: ${pred:,.0f}")\n',
      1,
      1,
    );
    return {
      ...emptyComposition(),
      panels: [load, aggregate, fit, forecast],
      layout: "grid",
      gridRows: 2,
      gridCols: 2,
      gridNumbers: true,
      showArrows: true,
      arrowColor: "#a6e3a1",
      arrows: {},
    };
  }
  if (id === "image-vs-image") {
    const before = await buildPlaceholderImagePanel();
    before.title = "Before";
    const after = await buildPlaceholderImagePanel();
    after.title = "After";
    return {
      ...emptyComposition(),
      panels: [before, after],
      layout: "horizontal",
      showArrows: true,
      arrows: { [before.id]: { style: "vs" } },
    };
  }
  // code-to-gif
  const code = makeCodePanel(PRINT_LOOP_DEMO);
  const gif = await buildBundledGifPanel();
  return {
    ...emptyComposition(),
    panels: [code, gif],
  };
};
