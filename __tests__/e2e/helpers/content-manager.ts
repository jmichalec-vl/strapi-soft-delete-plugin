import { api } from './api-client';

// --- Articles ---

interface Article {
  readonly id: number;
  readonly documentId: string;
  readonly title: string;
  readonly slug: string;
  readonly category?: { readonly documentId: string; readonly name: string } | null;
}

const CM_ARTICLE_PATH = '/content-manager/collection-types/api::article.article';

interface SeoComponent {
  readonly metaTitle: string;
  readonly metaDescription?: string;
}

interface LinkComponent {
  readonly label: string;
  readonly url: string;
}

interface HeroBlock {
  readonly __component: 'shared.hero';
  readonly heading: string;
  readonly subheading?: string;
}

interface SeoBlock {
  readonly __component: 'shared.seo';
  readonly metaTitle: string;
  readonly metaDescription?: string;
}

type DynamicZoneBlock = HeroBlock | SeoBlock;

interface CreateArticleOptions {
  readonly categoryDocumentId?: string;
  readonly seo?: SeoComponent;
  readonly links?: readonly LinkComponent[];
  readonly blocks?: readonly DynamicZoneBlock[];
}

export const createArticle = async (
  slug: string,
  title?: string,
  categoryOrOptions?: string | CreateArticleOptions,
): Promise<Article> => {
  const options: CreateArticleOptions =
    typeof categoryOrOptions === 'string'
      ? { categoryDocumentId: categoryOrOptions }
      : categoryOrOptions ?? {};

  const body: Record<string, unknown> = {
    title: title ?? `Test Article ${slug}`,
    slug,
    content: `Content for ${slug}`,
  };

  if (options.categoryDocumentId) {
    body.category = { documentId: options.categoryDocumentId };
  }

  if (options.seo) {
    body.seo = options.seo;
  }

  if (options.links) {
    body.links = options.links;
  }

  if (options.blocks) {
    body.blocks = options.blocks;
  }

  const { status, data } = await api.post(CM_ARTICLE_PATH, body);

  if (status !== 201 && status !== 200) {
    throw new Error(`Failed to create article (${status}): ${JSON.stringify(data)}`);
  }

  return (data as { data: Article }).data ?? (data as Article);
};

export const findArticleBySlug = async (
  slug: string,
  populate?: string,
): Promise<Article | null> => {
  const populateParam = populate ? `&populate=${populate}` : '';
  const { data } = await api.get(`${CM_ARTICLE_PATH}?filters[slug][$eq]=${slug}${populateParam}`);
  const results =
    (data as { results?: readonly Article[]; data?: readonly Article[] }).results ??
    (data as { data?: readonly Article[] }).data ??
    [];
  return results.find((a) => a.slug === slug) ?? null;
};

export const deleteArticle = async (documentId: string): Promise<void> => {
  await api.del(`${CM_ARTICLE_PATH}/${documentId}?locale=*`);
};

// --- Categories ---

interface Category {
  readonly id: number;
  readonly documentId: string;
  readonly name: string;
  readonly slug: string;
  readonly articles?: readonly Article[];
}

const CM_CATEGORY_PATH = '/content-manager/collection-types/api::category.category';

export const createCategory = async (slug: string, name?: string): Promise<Category> => {
  const { status, data } = await api.post(CM_CATEGORY_PATH, {
    name: name ?? `Category ${slug}`,
    slug,
  });

  if (status !== 201 && status !== 200) {
    throw new Error(`Failed to create category (${status}): ${JSON.stringify(data)}`);
  }

  return (data as { data: Category }).data ?? (data as Category);
};

export const findCategoryBySlug = async (
  slug: string,
  populate?: string,
): Promise<Category | null> => {
  const populateParam = populate ? `&populate=${populate}` : '';
  const { data } = await api.get(`${CM_CATEGORY_PATH}?filters[slug][$eq]=${slug}${populateParam}`);
  const results =
    (data as { results?: readonly Category[]; data?: readonly Category[] }).results ??
    (data as { data?: readonly Category[] }).data ??
    [];
  return results.find((c) => c.slug === slug) ?? null;
};

// --- Homepage (single type) ---

const CM_HOMEPAGE_PATH = '/content-manager/single-types/api::homepage.homepage';

interface Homepage {
  readonly id: number;
  readonly documentId: string;
  readonly title: string;
}

export const getHomepage = async (): Promise<Homepage | null> => {
  const { status, data } = await api.get(CM_HOMEPAGE_PATH);
  if (status === 404) return null;
  return (data as { data: Homepage }).data ?? (data as Homepage);
};

export const createOrUpdateHomepage = async (
  title: string,
  heroText: string,
): Promise<Homepage> => {
  const { status, data } = await api.put(CM_HOMEPAGE_PATH, { title, heroText });

  if (status !== 200 && status !== 201) {
    throw new Error(`Failed to create homepage (${status}): ${JSON.stringify(data)}`);
  }

  return (data as { data: Homepage }).data ?? (data as Homepage);
};

export const deleteHomepage = async (): Promise<void> => {
  // Single type DELETE has no documentId in the path
  await api.del(CM_HOMEPAGE_PATH);
};
