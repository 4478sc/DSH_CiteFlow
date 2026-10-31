import type { Folder, ImportKind, ImportResult, Reference, ReferenceType, SortKey } from '../types';

type ReferenceSeed = Omit<Reference, 'id'>;

const folderSeeds: Array<Pick<Folder, 'id' | 'name' | 'parentId'>> = [
  { id: 1, name: 'Machine Learning', parentId: null },
  { id: 11, name: 'Transformers', parentId: 1 },
  { id: 12, name: 'Generative Models', parentId: 1 },
  { id: 13, name: 'Interpretability', parentId: 1 },
  { id: 2, name: 'Human–Computer Interaction', parentId: null },
  { id: 21, name: 'CSCW & Collaboration', parentId: 2 },
  { id: 22, name: 'Accessibility', parentId: 2 },
  { id: 3, name: 'Research Methods', parentId: null },
  { id: 31, name: 'Statistics & Experiment Design', parentId: 3 },
  { id: 32, name: 'Qualitative Methods', parentId: 3 },
  { id: 4, name: 'Reading Queue', parentId: null },
  { id: 5, name: 'Design Systems', parentId: null },
  { id: 6, name: 'Archive', parentId: null },
  { id: 61, name: '2023', parentId: 6 },
  { id: 62, name: '2022', parentId: 6 },
];

const referenceSeeds: ReferenceSeed[] = [
  {
    type: 'inproceedings',
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit', 'Llion Jones', 'Aidan N. Gomez', 'Łukasz Kaiser', 'Illia Polosukhin'],
    year: 2017,
    booktitle: 'Advances in Neural Information Processing Systems 30 (NeurIPS 2017)',
    pages: '5998–6008',
    doi: '10.48550/arXiv.1706.03762',
    abstract:
      'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.',
    keywords: ['Transformers', 'Self-attention', 'Machine translation', 'Deep learning'],
    categoryId: 11,
    citationKey: 'vaswani2017attention',
    createdAt: '2026-10-12T09:24:00.000Z',
    read: true,
    starred: true,
  },
  {
    type: 'inproceedings',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    authors: ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee', 'Kristina Toutanova'],
    year: 2019,
    booktitle: 'Proceedings of NAACL-HLT 2019',
    pages: '4171–4186',
    doi: '10.18653/v1/N19-1423',
    abstract:
      'We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers. Unlike recent language representation models, BERT is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers.',
    keywords: ['NLP', 'Pre-training', 'Transformers', 'Language understanding'],
    categoryId: 11,
    citationKey: 'devlin2019bert',
    createdAt: '2026-10-11T15:02:00.000Z',
    read: true,
  },
  {
    type: 'inproceedings',
    title: 'Language Models are Few-Shot Learners',
    authors: ['Tom B. Brown', 'Benjamin Mann', 'Nick Ryder', 'Melanie Subbiah', 'Jared Kaplan', 'Prafulla Dhariwal'],
    year: 2020,
    booktitle: 'Advances in Neural Information Processing Systems 33 (NeurIPS 2020)',
    pages: '1877–1901',
    doi: '10.48550/arXiv.2005.14165',
    abstract:
      'We show that scaling up language models greatly improves task-agnostic, few-shot performance, sometimes even reaching competitiveness with prior state-of-the-art fine-tuning approaches. We train a 175 billion parameter autoregressive language model, GPT-3, and evaluate it across more than two dozen NLP datasets.',
    keywords: ['Large language models', 'Few-shot learning', 'GPT-3', 'In-context learning'],
    categoryId: 12,
    citationKey: 'brown2020language',
    createdAt: '2026-10-09T08:36:00.000Z',
    read: true,
    starred: true,
  },
  {
    type: 'inproceedings',
    title: 'Chain-of-Thought Prompting Elicits Reasoning in Large Language Models',
    authors: ['Jason Wei', 'Xuezhi Wang', 'Dale Schuurmans', 'Maarten Bosma', 'Brian Ichter', 'Fei Xia', 'Ed H. Chi', 'Quoc V. Le', 'Denny Zhou'],
    year: 2022,
    booktitle: 'Advances in Neural Information Processing Systems 35 (NeurIPS 2022)',
    pages: '24824–24837',
    doi: '10.48550/arXiv.2201.11903',
    abstract:
      'We explore how generating a chain of thought — a series of intermediate reasoning steps — significantly improves the ability of large language models to perform complex reasoning. Experiments show that such reasoning abilities emerge naturally in sufficiently large models when prompted with a few exemplars.',
    keywords: ['Reasoning', 'Prompting', 'LLMs', 'Emergent abilities'],
    categoryId: 12,
    citationKey: 'wei2022chain',
    createdAt: '2026-10-08T11:18:00.000Z',
    read: true,
  },
  {
    type: 'article',
    title: 'Toy Models of Superposition',
    authors: ['Nelson Elhage', 'Tristan Hume', 'Catherine Olsson', 'Nicholas Schiefer', 'Tom Henighan'],
    year: 2022,
    journal: 'Transformer Circuits Thread',
    doi: '10.48550/arXiv.2209.10652',
    abstract:
      'Neural networks often exhibit superposition: representing more features than they have dimensions. We study simplified models to understand when and why superposition emerges, and how it affects the geometry of learned representations.',
    keywords: ['Superposition', 'Interpretability', 'Representation learning'],
    categoryId: 13,
    citationKey: 'elhage2022toy',
    createdAt: '2026-10-07T16:45:00.000Z',
    read: false,
    starred: true,
  },
  {
    type: 'article',
    title: 'Towards Monosemanticity: Decomposing Language Models with Dictionary Learning',
    authors: ['Trenton Bricken', 'Adly Templeton', 'Joshua Batson', 'Brian Chen', 'Adam Jermyn'],
    year: 2023,
    journal: 'Transformer Circuits Thread',
    doi: '10.48550/arXiv.2310.01405',
    abstract:
      'We use sparse autoencoders to extract monosemantic features from a one-layer transformer. Our results suggest that dictionary learning can recover interpretable features that activate on distinct and meaningful concepts.',
    keywords: ['Sparse autoencoders', 'Features', 'Mechanistic interpretability'],
    categoryId: 13,
    citationKey: 'bricken2023monosemanticity',
    createdAt: '2026-10-05T10:10:00.000Z',
    read: false,
  },
  {
    type: 'article',
    title: 'A Survey of Large Language Models',
    authors: ['Wayne Xin Zhao', 'Kun Zhou', 'Junyi Li', 'Tianyi Tang', 'Xiaolei Wang', 'Yupeng Hou'],
    year: 2023,
    journal: 'arXiv preprint arXiv:2303.18223',
    doi: '10.48550/arXiv.2303.18223',
    abstract:
      'This survey reviews the recent advances of large language models, covering pre-training, adaptation tuning, utilization, and capacity evaluation. It also discusses open challenges including hallucination, alignment, and efficient deployment.',
    keywords: ['Large language models', 'Survey', 'Alignment'],
    categoryId: 1,
    citationKey: 'zhao2023survey',
    createdAt: '2026-10-04T09:00:00.000Z',
    read: false,
  },
  {
    type: 'article',
    title: 'Deep Learning',
    authors: ['Yann LeCun', 'Yoshua Bengio', 'Geoffrey Hinton'],
    year: 2015,
    journal: 'Nature',
    volume: '521',
    issue: '7553',
    pages: '436–444',
    doi: '10.1038/nature14539',
    abstract:
      'Deep learning allows computational models that are composed of multiple processing layers to learn representations of data with multiple levels of abstraction. These methods have dramatically improved the state of the art in speech recognition, visual object recognition, and many other domains.',
    keywords: ['Deep learning', 'Neural networks', 'Representation learning'],
    categoryId: 1,
    citationKey: 'lecun2015deep',
    createdAt: '2026-10-02T14:22:00.000Z',
    read: true,
    starred: true,
  },
  {
    type: 'inproceedings',
    title: 'Research through Design in HCI',
    authors: ['John Zimmerman', 'Erik Stolterman', 'Jodi Forlizzi'],
    year: 2010,
    booktitle: 'CHI 2010 Extended Abstracts on Human Factors in Computing Systems',
    pages: '3103–3106',
    doi: '10.1145/1753846.1753926',
    abstract:
      'We argue that design practice can produce knowledge about the world and describe research through design as an approach for generating new knowledge. We discuss how designers construct artifacts and how these artifacts embody theories about the future.',
    keywords: ['Research through design', 'HCI', 'Design theory'],
    categoryId: 21,
    citationKey: 'zimmerman2010research',
    createdAt: '2026-09-28T17:03:00.000Z',
    read: true,
  },
  {
    type: 'book',
    title: 'The Design of Everyday Things',
    authors: ['Don Norman'],
    year: 2013,
    publisher: 'Basic Books',
    address: 'New York',
    abstract:
      'A powerful primer on how — and why — some products satisfy customers while others only frustrate them. Norman explains the psychology of good design through affordances, signifiers, feedback, and mental models.',
    keywords: ['Interaction design', 'Usability', 'Affordances', 'Cognition'],
    categoryId: 2,
    citationKey: 'norman2013design',
    createdAt: '2026-09-27T12:32:00.000Z',
    read: true,
  },  {
    type: 'article',
    title: 'Accessibility Mapping: A Framework for Designing Inclusive Experiences',
    authors: ['Micaela Moreno', 'Sarah Lewthwaite', 'David Sloan'],
    year: 2024,
    journal: 'Interacting with Computers',
    volume: '36',
    issue: '2',
    pages: '101–118',
    doi: '10.1093/iwc/iwae009',
    abstract:
      'We present a framework for mapping accessibility decisions across the product lifecycle. Drawing on interviews with 24 design teams, we identify where inclusive practices break down and offer practical scaffolding for teams.',
    keywords: ['Accessibility', 'Inclusive design', 'Design process'],
    categoryId: 22,
    citationKey: 'moreno2024accessibility',
    createdAt: '2026-09-24T10:14:00.000Z',
    read: false,
    starred: true,
  },
  {
    type: 'inproceedings',
    title: 'Ability-Based Design: Concept, Principles and Examples',
    authors: ['Jacob O. Wobbrock', 'Shaun K. Kane', 'Krzysztof Z. Gajos', 'Susumu Harada', 'Jon Froehlich'],
    year: 2011,
    booktitle: 'Proceedings of the 13th International ACM SIGACCESS Conference on Computers and Accessibility',
    pages: '3–10',
    doi: '10.1145/2049536.2049541',
    abstract:
      'Ability-based design is a new approach to accessibility that shifts attention from the abilities a technology requires to the abilities a user possesses. It asks designers to build systems that adapt to users rather than requiring users to adapt.',
    keywords: ['Accessibility', 'Ability-based design', 'Adaptive interfaces'],
    categoryId: 22,
    citationKey: 'wobbrock2011ability',
    createdAt: '2026-09-22T09:45:00.000Z',
    read: true,
  },
  {
    type: 'misc',
    title: 'Web Content Accessibility Guidelines (WCAG) 2.2',
    authors: ['W3C Web Accessibility Initiative'],
    year: 2023,
    url: 'https://www.w3.org/TR/WCAG22/',
    abstract:
      'WCAG 2.2 defines how to make web content more accessible to people with disabilities. The guidelines are organized under four principles: perceivable, operable, understandable, and robust.',
    keywords: ['Accessibility', 'WCAG', 'Standards', 'Web'],
    categoryId: 22,
    citationKey: 'w3c2023wcag22',
    createdAt: '2026-09-21T13:17:00.000Z',
    read: true,
  },
  {
    type: 'article',
    title: 'A Survey of Human-AI Collaboration: Patterns, Challenges and Opportunities',
    authors: ['Qian Yang', 'Nikola Banovic', 'Lydia B. Chilton'],
    year: 2023,
    journal: 'ACM Transactions on Computer-Human Interaction',
    volume: '30',
    issue: '4',
    pages: '1–42',
    doi: '10.1145/3596456',
    abstract:
      'This survey maps the design space of human-AI collaboration across mixed-initiative interaction, co-creation, and decision support. We identify recurring patterns and propose a research agenda for evaluating collaborative AI systems.',
    keywords: ['Human-AI collaboration', 'Mixed-initiative', 'CSCW', 'Evaluation'],
    categoryId: 21,
    citationKey: 'yang2023survey',
    createdAt: '2026-09-18T08:20:00.000Z',
    read: true,
    starred: true,
  },
  {
    type: 'inproceedings',
    title: 'Mixed-Initiative Interfaces for Creative Work',
    authors: ['Erin T. Solberg', 'Nadia Rahman', 'Leo Martins'],
    year: 2024,
    booktitle: 'Proceedings of the 2024 CHI Conference on Human Factors in Computing Systems',
    pages: '1–16',
    doi: '10.1145/3613904.3642410',
    abstract:
      'We study how mixed-initiative interaction shapes creative agency in AI-assisted writing tools. A controlled study with 48 participants shows that reversible suggestions and explicit initiative handoffs increase perceived control without reducing output quality.',
    keywords: ['Mixed-initiative', 'Creativity', 'Human-AI collaboration', 'Agency'],
    categoryId: 21,
    citationKey: 'solberg2024mixed',
    createdAt: '2026-08-04T11:43:00.000Z',
    read: false,
    starred: true,
  },
  {
    type: 'article',
    title: 'A Mathematical Theory of Communication',
    authors: ['Claude E. Shannon'],
    year: 1948,
    journal: 'Bell System Technical Journal',
    volume: '27',
    issue: '3',
    pages: '379–423',
    doi: '10.1002/j.1538-7305.1948.tb01338.x',
    abstract:
      'The fundamental problem of communication is that of reproducing at one point either exactly or approximately a message selected at another point. This paper develops a mathematical theory of communication and introduces the concept of information entropy.',
    keywords: ['Information theory', 'Entropy', 'Communication'],
    categoryId: 31,
    citationKey: 'shannon1948mathematical',
    createdAt: '2026-09-12T12:00:00.000Z',
    read: true,
    starred: true,
  },
  {
    type: 'book',
    title: 'Statistical Power Analysis for the Behavioral Sciences',
    authors: ['Jacob Cohen'],
    year: 1988,
    publisher: 'Lawrence Erlbaum Associates',
    address: 'Hillsdale, NJ',
    abstract:
      'This classic text provides a comprehensive treatment of statistical power analysis. It covers effect size estimation, power calculations, and the design of experiments with adequate sensitivity.',
    keywords: ['Statistics', 'Power analysis', 'Effect size', 'Experimental design'],
    categoryId: 31,
    citationKey: 'cohen1988statistical',
    createdAt: '2026-09-10T09:30:00.000Z',
    read: true,
  },
  {
    type: 'book',
    title: 'Designing Social Inquiry: Scientific Inference in Qualitative Research',
    authors: ['Gary King', 'Robert O. Keohane', 'Sidney Verba'],
    year: 1994,
    publisher: 'Princeton University Press',
    address: 'Princeton, NJ',
    abstract:
      'The authors argue that qualitative and quantitative research share a common logic of inference. They provide practical guidance for improving the rigor of qualitative research designs and causal claims.',
    keywords: ['Research design', 'Causal inference', 'Qualitative methods'],
    categoryId: 31,
    citationKey: 'king1994designing',
    createdAt: '2026-09-08T15:10:00.000Z',
    read: false,
  },
  {
    type: 'book',
    title: 'Constructing Grounded Theory',
    authors: ['Kathy Charmaz'],
    year: 2014,
    publisher: 'SAGE Publications',
    address: 'London',
    abstract:
      'Charmaz presents a constructivist approach to grounded theory, explaining how to collect and analyze qualitative data while developing theory. The book provides practical guidance on coding, memo writing, and theoretical sampling.',
    keywords: ['Grounded theory', 'Qualitative research', 'Coding'],
    categoryId: 32,
    citationKey: 'charmaz2014constructing',
    createdAt: '2026-09-06T10:44:00.000Z',
    read: true,
  },
  {
    type: 'book',
    title: 'The Craft of Research',
    authors: ['Wayne C. Booth', 'Gregory G. Colomb', 'Joseph M. Williams'],
    year: 2008,
    publisher: 'University of Chicago Press',
    address: 'Chicago',
    abstract:
      'This guide explains how to plan, conduct, and report research. It covers finding a question, engaging sources, making claims, and communicating evidence to readers.',
    keywords: ['Research writing', 'Methodology', 'Academic writing'],
    categoryId: 32,
    citationKey: 'booth2008craft',
    createdAt: '2026-09-04T17:25:00.000Z',
    read: true,
  },  {
    type: 'book',
    title: 'The Sciences of the Artificial',
    authors: ['Herbert A. Simon'],
    year: 1996,
    publisher: 'MIT Press',
    address: 'Cambridge, MA',
    abstract:
      'Simon examines the sciences of design and argues that artificial systems can be understood through the study of their goals and environments. A foundational text for design research and bounded rationality.',
    keywords: ['Design science', 'Bounded rationality', 'Systems'],
    categoryId: 4,
    citationKey: 'simon1996sciences',
    createdAt: '2026-08-30T14:07:00.000Z',
    read: false,
    starred: true,
  },
  {
    type: 'book',
    title: 'How to Take Smart Notes',
    authors: ['Sönke Ahrens'],
    year: 2017,
    publisher: 'CreateSpace',
    abstract:
      'Ahrens explains the Zettelkasten method for turning reading and ideas into a network of reusable notes. The book connects note-taking practices to writing, creativity, and long-term learning.',
    keywords: ['Note-taking', 'Zettelkasten', 'Knowledge management'],
    categoryId: 4,
    citationKey: 'ahrens2017smart',
    createdAt: '2026-08-26T09:55:00.000Z',
    read: true,
  },
  {
    type: 'article',
    title: 'Design Tokens: Scaling Design Decisions Across Platforms',
    authors: ['Maeve O’Connor', 'Ravi Raman'],
    year: 2021,
    journal: 'Design Systems Journal',
    volume: '8',
    issue: '1',
    pages: '14–29',
    doi: '10.5555/dsj.2021.8.1.14',
    abstract:
      'Design tokens encode design decisions in a platform-agnostic format. Drawing on case studies from four organizations, we describe governance models and tooling for keeping token libraries synchronized across products.',
    keywords: ['Design systems', 'Design tokens', 'Design operations'],
    categoryId: 5,
    citationKey: 'oconnor2021design',
    createdAt: '2026-08-22T13:40:00.000Z',
    read: true,
    starred: true,
  },
  {
    type: 'book',
    title: 'Refactoring UI',
    authors: ['Adam Wathan', 'Steve Schoger'],
    year: 2018,
    publisher: 'Self-published',
    abstract:
      'A practical guide to visual design for developers and product teams. The book covers hierarchy, spacing, color, typography, and the small decisions that make interfaces feel polished.',
    keywords: ['UI design', 'Visual hierarchy', 'Typography', 'Color'],
    categoryId: 5,
    citationKey: 'wathan2018refactoring',
    createdAt: '2026-08-20T15:21:00.000Z',
    read: true,
  },
  {
    type: 'book',
    title: 'Atomic Design',
    authors: ['Brad Frost'],
    year: 2016,
    publisher: 'Brad Frost',
    address: 'Pittsburgh, PA',
    abstract:
      'Atomic Design introduces a methodology for creating design systems with five distinct levels: atoms, molecules, organisms, templates, and pages. It shows how to build interfaces that are consistent and scalable.',
    keywords: ['Design systems', 'Components', 'Frontend'],
    categoryId: 5,
    citationKey: 'frost2016atomic',
    createdAt: '2026-08-18T10:09:00.000Z',
    read: false,
  },
  {
    type: 'article',
    title: 'Foundation Models: Opportunities and Risks for the Research Community',
    authors: ['Rishi Bommasani', 'Drew A. Hudson', 'Ehsan Adeli', 'Russ Altman'],
    year: 2023,
    journal: 'arXiv preprint arXiv:2302.11412',
    doi: '10.48550/arXiv.2302.11412',
    abstract:
      'This report examines the emergence of foundation models and their implications for research. It discusses opportunities for scientific discovery alongside risks related to concentration, evaluation, and access.',
    keywords: ['Foundation models', 'AI policy', 'Evaluation'],
    categoryId: 61,
    citationKey: 'bommasani2023foundation',
    createdAt: '2026-08-15T08:48:00.000Z',
    read: false,
  },
  {
    type: 'article',
    title: 'A Survey on Mechanistic Interpretability for Transformer Language Models',
    authors: ['Elena Rossi', 'Marcus Chen', 'Aisha Patel'],
    year: 2023,
    journal: 'Computational Linguistics Review',
    volume: '49',
    issue: '3',
    pages: '501–548',
    doi: '10.5555/clr.2023.49.3.501',
    abstract:
      'We survey methods for reverse-engineering the internal computations of transformer language models. The review organizes work on circuits, probing, sparse autoencoders, and causal interventions, and proposes shared evaluation criteria.',
    keywords: ['Interpretability', 'Transformers', 'Circuits', 'Survey'],
    categoryId: 61,
    citationKey: 'rossi2023survey',
    createdAt: '2026-08-13T16:31:00.000Z',
    read: true,
  },
  {
    type: 'article',
    title: 'Emergent Abilities of Large Language Models',
    authors: ['Jason Wei', 'Yi Tay', 'Rishi Bommasani', 'Colin Raffel', 'Barret Zoph'],
    year: 2022,
    journal: 'Transactions on Machine Learning Research',
    doi: '10.48550/arXiv.2206.07682',
    abstract:
      'We discuss the phenomenon of emergent abilities in large language models: skills that are not present in smaller models but appear in larger ones. We survey examples and discuss implications for scaling and evaluation.',
    keywords: ['Emergent abilities', 'Scaling', 'LLMs', 'Evaluation'],
    categoryId: 62,
    citationKey: 'wei2022emergent',
    createdAt: '2026-08-10T12:04:00.000Z',
    read: true,
    starred: true,
  },
  {
    type: 'inproceedings',
    title: 'Training Language Models to Follow Instructions with Human Feedback',
    authors: ['Long Ouyang', 'Jeffrey Wu', 'Xu Jiang', 'Diogo Almeida', 'Carroll L. Wainwright'],
    year: 2022,
    booktitle: 'Advances in Neural Information Processing Systems 35 (NeurIPS 2022)',
    pages: '27730–27744',
    doi: '10.48550/arXiv.2203.02155',
    abstract:
      'We fine-tune language models with human feedback using reinforcement learning from human feedback. The resulting InstructGPT models are preferred by labelers to much larger models and show improved truthfulness and reduced toxicity.',
    keywords: ['RLHF', 'Alignment', 'Instruction tuning'],
    categoryId: 62,
    citationKey: 'ouyang2022training',
    createdAt: '2026-08-07T09:27:00.000Z',
    read: false,
  },
];
let folders: Folder[] = folderSeeds.map((folder) => ({ ...folder, children: [] }));
let references: Reference[] = referenceSeeds.map((reference, index) => ({
  ...reference,
  id: index + 1,
}));
let nextFolderId = Math.max(...folders.map((folder) => folder.id)) + 1;
let nextReferenceId = Math.max(...references.map((reference) => reference.id)) + 1;

const cloneReference = (reference: Reference): Reference => ({
  ...reference,
  authors: [...reference.authors],
  keywords: reference.keywords ? [...reference.keywords] : undefined,
});

function descendantsOf(folderId: number): Set<number> {
  const result = new Set<number>([folderId]);
  const stack = [folderId];
  while (stack.length > 0) {
    const current = stack.pop() as number;
    folders
      .filter((folder) => folder.parentId === current)
      .forEach((child) => {
        result.add(child.id);
        stack.push(child.id);
      });
  }
  return result;
}

function isFolderInside(folderId: number, possibleAncestorId: number): boolean {
  return descendantsOf(possibleAncestorId).has(folderId);
}

function buildFolderTree(): Folder[] {
  const childrenByParent = new Map<number | null, Folder[]>();
  for (const folder of folders) {
    const parentKey = folder.parentId ?? null;
    const list = childrenByParent.get(parentKey) ?? [];
    list.push(folder);
    childrenByParent.set(parentKey, list);
  }

  const build = (folder: Folder): Folder => {
    const children = (childrenByParent.get(folder.id) ?? [])
      .map(build)
      .sort((a, b) => a.name.localeCompare(b.name));
    const directCount = references.filter((reference) => reference.categoryId === folder.id).length;
    return {
      ...folder,
      children,
      directCount,
      referenceCount: directCount + children.reduce((sum, child) => sum + (child.referenceCount ?? 0), 0),
    };
  };

  return (childrenByParent.get(null) ?? [])
    .map(build)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function sortReferences(items: Reference[], sort: SortKey): Reference[] {
  const sorted = [...items];
  switch (sort) {
    case 'year-desc':
      return sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));
    case 'year-asc':
      return sorted.sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title));
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'author':
      return sorted.sort((a, b) => (a.authors[0] ?? '').localeCompare(b.authors[0] ?? ''));
    case 'added':
    default:
      return sorted.sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime() || b.id - a.id,
      );
  }
}

function getReferences(folderId?: number | null, search = '', sort: SortKey = 'added'): Reference[] {
  const scope = folderId != null ? descendantsOf(folderId) : null;
  const query = search.trim().toLowerCase();
  const filtered = references.filter((reference) => {
    if (scope && (reference.categoryId == null || !scope.has(reference.categoryId))) return false;
    if (!query) return true;
    return [
      reference.title,
      reference.authors.join(' '),
      reference.journal ?? '',
      reference.booktitle ?? '',
      reference.year?.toString() ?? '',
      (reference.keywords ?? []).join(' '),
      reference.doi ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
  return sortReferences(filtered, sort).map(cloneReference);
}

function makeCitationKey(reference: Pick<Reference, 'authors' | 'title' | 'year' | 'citationKey'>): string {
  if (reference.citationKey) return reference.citationKey;
  const firstAuthor = reference.authors[0] ?? 'unknown';
  const lastName = firstAuthor.trim().split(/\s+/).pop()?.replace(/[^a-zA-Z]/g, '') || 'unknown';
  const firstWord =
    reference.title
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .find((word) => word.length > 3) ?? 'untitled';
  return `${lastName.toLowerCase()}${reference.year ?? ''}${firstWord.toLowerCase()}`;
}

const bibtexType: Record<ReferenceType, string> = {
  article: 'article',
  inproceedings: 'inproceedings',
  book: 'book',
  masterthesis: 'mastersthesis',
  phdthesis: 'phdthesis',
  incollection: 'incollection',
  techreport: 'techreport',
  misc: 'misc',
};

function toBibtex(reference: Reference): string {
  const fields: Array<[string, string | undefined]> = [
    ['title', reference.title],
    ['author', reference.authors.join(' and ')],
    ['year', reference.year?.toString()],
    ['journal', reference.journal],
    ['booktitle', reference.booktitle],
    ['volume', reference.volume],
    ['number', reference.issue],
    ['pages', reference.pages],
    ['doi', reference.doi],
    ['publisher', reference.publisher],
    ['address', reference.address],
    ['school', reference.school],
    ['url', reference.url],
    ['keywords', reference.keywords?.join(', ')],
  ];
  const lines = fields
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `  ${key} = {${value}}`)
    .join(',\n');
  return `@${bibtexType[reference.type]}{${makeCitationKey(reference)},\n${lines}\n}`;
}

function exportBibtex(ids?: number[], folderId?: number | null): string {
  const selected =
    ids && ids.length > 0
      ? references.filter((reference) => ids.includes(reference.id))
      : getReferences(folderId);
  return selected.map(toBibtex).join('\n\n');
}

function decodeRis(raw: string): ReferenceSeed[] {
  const records = raw
    .replace(/\r\n/g, '\n')
    .split(/\nER\s{0,2}-.*/)
    .map((record) => record.trim())
    .filter(Boolean);
  const parsed: ReferenceSeed[] = [];

  for (const record of records) {
    const values = new Map<string, string[]>();
    for (const line of record.split('\n')) {
      const match = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
      if (!match) continue;
      const [, tag, value] = match;
      const list = values.get(tag) ?? [];
      list.push(value.trim());
      values.set(tag, list);
    }
    const first = (tags: string[]) => tags.map((tag) => values.get(tag)?.[0]).find(Boolean);
    const all = (tag: string) => values.get(tag) ?? [];
    const title = first(['TI', 'T1', 'BT']);
    if (!title) continue;
    const risType = first(['TY'])?.toUpperCase() ?? 'GEN';
    const type: ReferenceType =
      risType === 'JOUR'
        ? 'article'
        : risType === 'BOOK'
          ? 'book'
          : risType === 'THES'
            ? 'phdthesis'
            : risType === 'CHAP'
              ? 'incollection'
              : risType === 'CONF' || risType === 'CPAPER'
                ? 'inproceedings'
                : 'misc';
    const yearMatch = first(['PY', 'Y1', 'DA'])?.match(/\d{4}/);
    const startPage = first(['SP']);
    const endPage = first(['EP']);
    const authors = all('AU').length > 0 ? all('AU') : all('A1');
    parsed.push({
      type,
      title,
      authors,
      year: yearMatch ? Number(yearMatch[0]) : undefined,
      journal: first(['JO', 'JF', 'T2']),
      booktitle: first(['BT', 'T2']),
      volume: first(['VL']),
      issue: first(['IS']),
      pages: startPage ? (endPage ? `${startPage}–${endPage}` : startPage) : undefined,
      doi: first(['DO']),
      url: first(['UR']),
      abstract: first(['AB', 'N2']),
      keywords: all('KW')
        .flatMap((keyword) => keyword.split(/[;,]/))
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      publisher: first(['PB']),
      address: first(['CY', 'PP']),
      importedFrom: 'RIS',
      createdAt: new Date().toISOString(),
    });
  }
  return parsed;
}

function decodeWos(raw: string): ReferenceSeed[] {
  const records = raw
    .replace(/\r\n/g, '\n')
    .split(/\nER\s*\n?/)
    .map((record) => record.trim())
    .filter((record) => /\n(?:TI|T1) /.test(`\n${record}`));
  const parsed: ReferenceSeed[] = [];

  for (const record of records) {
    const values = new Map<string, string[]>();
    let currentTag = '';
    for (const line of record.split('\n')) {
      const tagMatch = line.match(/^([A-Z0-9]{2})\s(.*)$/);
      if (tagMatch) {
        currentTag = tagMatch[1];
        const list = values.get(currentTag) ?? [];
        list.push(tagMatch[2].trim());
        values.set(currentTag, list);
      } else if (currentTag && line.trim()) {
        const list = values.get(currentTag) ?? [];
        list[list.length - 1] = `${list[list.length - 1]} ${line.trim()}`;
        values.set(currentTag, list);
      }
    }
    const first = (tags: string[]) => tags.map((tag) => values.get(tag)?.[0]).find(Boolean);
    const title = first(['TI', 'T1']);
    if (!title) continue;
    const publicationType = first(['PT'])?.toUpperCase() ?? 'J';
    const type: ReferenceType =
      publicationType === 'B' ? 'book' : publicationType === 'C' ? 'inproceedings' : 'article';
    const yearMatch = first(['PY', 'Y1'])?.match(/\d{4}/);
    const startPage = first(['BP']);
    const endPage = first(['EP']);
    parsed.push({
      type,
      title,
      authors: values.get('AU') ?? values.get('A1') ?? [],
      year: yearMatch ? Number(yearMatch[0]) : undefined,
      journal: first(['SO', 'JO', 'JF']),
      booktitle: first(['BT']),
      volume: first(['VL']),
      issue: first(['IS']),
      pages: startPage ? (endPage ? `${startPage}–${endPage}` : startPage) : first(['AR']),
      doi: first(['DI', 'DO']),
      url: first(['UR']),
      abstract: first(['AB']),
      keywords: (values.get('DE') ?? [])
        .flatMap((keyword) => keyword.split(/[;]/))
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      publisher: first(['PU', 'PB']),
      address: first(['CY']),
      importedFrom: 'Web of Science',
      createdAt: new Date().toISOString(),
    });
  }
  return parsed;
}

async function importFile(kind: ImportKind, file: File, folderId?: number | null): Promise<ImportResult> {
  let entries: ReferenceSeed[] = [];
  if (kind === 'pdf') {
    const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    entries = [
      {
        type: 'misc',
        title: title || 'Untitled PDF',
        authors: [],
        importedFrom: 'PDF',
        categoryId: folderId ?? null,
        createdAt: new Date().toISOString(),
        keywords: ['PDF'],
      },
    ];
  } else {
    const raw = await file.text();
    entries = kind === 'ris' ? decodeRis(raw) : decodeWos(raw);
  }

  if (entries.length === 0) {
    return {
      success: 0,
      failed: 1,
      references: [],
      errors: ['No readable records were found in this file.'],
    };
  }

  const added = entries.map((entry) => {
    const reference: Reference = {
      ...entry,
      id: nextReferenceId++,
      categoryId: folderId ?? null,
      citationKey: makeCitationKey(entry),
    };
    references = [reference, ...references];
    return cloneReference(reference);
  });

  return { success: added.length, failed: 0, references: added, errors: [] };
}

export const demoStore = {
  getFolders: (): Folder[] => buildFolderTree(),
  getReference: (id: number): Reference | null => {
    const reference = references.find((item) => item.id === id);
    return reference ? cloneReference(reference) : null;
  },
  getReferences,
  createFolder: (name: string, parentId?: number | null): Folder => {
    const folder: Folder = {
      id: nextFolderId++,
      name: name.trim() || 'Untitled collection',
      parentId: parentId ?? null,
      createdAt: new Date().toISOString(),
    };
    folders = [...folders, folder];
    return folder;
  },
  renameFolder: (id: number, name: string): Folder => {
    const folder = folders.find((item) => item.id === id);
    if (!folder) throw new Error('Collection not found');
    folder.name = name.trim() || folder.name;
    return folder;
  },
  deleteFolder: (id: number): void => {
    if (!folders.some((item) => item.id === id)) return;
    const doomed = descendantsOf(id);
    folders = folders.filter((item) => !doomed.has(item.id));
    references = references.map((reference) =>
      reference.categoryId != null && doomed.has(reference.categoryId)
        ? { ...reference, categoryId: null }
        : reference,
    );
  },
  moveFolder: (id: number, parentId: number | null): Folder => {
    const folder = folders.find((item) => item.id === id);
    if (!folder) throw new Error('Collection not found');
    if (parentId === id || (parentId != null && isFolderInside(parentId, id))) {
      throw new Error('A collection cannot be moved inside itself');
    }
    folder.parentId = parentId;
    return folder;
  },
  deleteReferences: (ids: number[]): void => {
    references = references.filter((reference) => !ids.includes(reference.id));
  },
  moveReferences: (ids: number[], folderId: number | null): void => {
    references = references.map((reference) =>
      ids.includes(reference.id) ? { ...reference, categoryId: folderId } : reference,
    );
  },
  copyReferences: (ids: number[], folderId: number | null): number[] => {
    const copies = references
      .filter((reference) => ids.includes(reference.id))
      .map((reference) => ({
        ...cloneReference(reference),
        id: nextReferenceId++,
        categoryId: folderId,
      }));
    references = [...copies, ...references];
    return copies.map((copy) => copy.id);
  },
  importFile,
  exportBibtex,
};