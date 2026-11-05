import { randomUUID } from "node:crypto";

// The renderer receives review data, but never supplies trusted source hashes.
export class Workflow {
  constructor(run) {
    this.run = run;
    this.review = null;
    this.busy = false;
  }
  async execute(action, folder, archives = {}, reviewId) {
    if (this.busy) throw new Error("Aguarde a operação atual terminar.");
    this.busy = true;
    try {
      if (action === "preview") {
        this.review = null;
        const data = await this.run("preview", folder, archives);
        this.review = {
          id: randomUUID(),
          folder,
          data,
          archives: structuredClone(archives),
        };
        return { data, reviewId: this.review.id };
      }
      if (action === "ytyp") {
        this.review = null;
        return { data: await this.run("ytyp", folder, {}), reviewId: null };
      }
      if (
        action !== "convert" ||
        !this.review ||
        reviewId !== this.review.id ||
        folder !== this.review.folder
      )
        throw new Error("Revise os arquivos novamente antes de converter.");
      const review = this.review;
      this.review = null;
      const requests = {};
      for (const item of review.data) {
        const options = review.archives[item.archive] ?? {};
        if (options.selected === false) continue;
        if (!item.ok || item.audit?.ok === false)
          throw new Error("Corrija os erros antes de converter.");
        if (item.exists && !["backup", "cancel"].includes(options.existing))
          throw new Error(
            "Escolha o que fazer com a pasta existente antes de converter.",
          );
        requests[item.archive] = {
          ...options,
          expectedSource: item.sourceHash,
          selected: true,
        };
      }
      if (!Object.keys(requests).length)
        throw new Error("Selecione pelo menos um RPF para converter.");
      return {
        data: await this.run("convert", folder, requests),
        reviewId: null,
      };
    } finally {
      this.busy = false;
    }
  }
}
