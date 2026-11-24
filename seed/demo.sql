-- Demo data. Book metadata is public catalogue information; members and staff are fictional.
-- Loan dates are relative to now() so ACTIVE / OVERDUE / RETURNED states always exist.

-- Historical staff who processed the seeded loans (fictional; cannot sign in: .test domain, not demo).
-- The two demo sign-in accounts are created from configuration, never from this file.
INSERT INTO staff_users (email, full_name, role) VALUES
  ('layla.haddad@library.test', 'Layla Haddad', 'LIBRARIAN')
ON CONFLICT DO NOTHING;

INSERT INTO books (title, author, isbn, category, publisher, publication_year, total_copies, available_copies, description) VALUES
  ('Clean Architecture', 'Robert C. Martin', '9780134494166', 'Software Architecture', 'Prentice Hall', 2017, 3, 3, 'Principles for structuring software so business rules stay independent of frameworks, databases and UI.'),
  ('Designing Data-Intensive Applications', 'Martin Kleppmann', '9781449373320', 'Software Architecture', 'O''Reilly Media', 2017, 4, 4, 'Reliability, scalability and maintainability of data systems: replication, partitioning, transactions and streams.'),
  ('Fundamentals of Software Architecture', 'Mark Richards, Neal Ford', NULL, 'Software Architecture', 'O''Reilly Media', 2020, 3, 3, 'A beginner-friendly engineering approach to architecture styles, characteristics and trade-offs.'),
  ('Software Architecture: The Hard Parts', 'Neal Ford, Mark Richards, Pramod Sadalage, Zhamak Dehghani', NULL, 'Software Architecture', 'O''Reilly Media', 2021, 2, 2, 'Trade-off analysis for distributed architectures: decomposition, data ownership and workflows.'),
  ('Building Microservices', 'Sam Newman', NULL, 'Software Architecture', 'O''Reilly Media', 2021, 2, 2, 'Designing fine-grained systems: service boundaries, integration, deployment and organisational fit.'),
  ('Domain-Driven Design', 'Eric Evans', NULL, 'Software Architecture', 'Addison-Wesley', 2003, 2, 2, 'Tackling complexity in the heart of software with a shared domain model and bounded contexts.'),
  ('Patterns of Enterprise Application Architecture', 'Martin Fowler', NULL, 'Software Architecture', 'Addison-Wesley', 2002, 1, 1, 'Catalogue of patterns for layering, persistence mapping and concurrency in business applications.'),
  ('System Design Interview: An Insider''s Guide', 'Alex Xu', NULL, 'Software Architecture', 'Independently published', 2020, 3, 3, 'Step-by-step framework for designing scalable systems such as rate limiters, caches and chat services.'),
  ('Team Topologies', 'Matthew Skelton, Manuel Pais', NULL, 'Software Architecture', 'IT Revolution', 2019, 2, 2, 'Organising business and technology teams for fast flow; Conway''s law applied to team design.'),

  ('Clean Code', 'Robert C. Martin', '9780132350884', 'Programming', 'Prentice Hall', 2008, 4, 4, 'A handbook of agile software craftsmanship: naming, functions, tests and readable code.'),
  ('The Pragmatic Programmer', 'David Thomas, Andrew Hunt', '9780135957059', 'Programming', 'Addison-Wesley', 2019, 3, 3, 'Practical advice on the craft of programming, from career habits to design and debugging.'),
  ('Refactoring', 'Martin Fowler', '9780134757599', 'Programming', 'Addison-Wesley', 2018, 2, 2, 'Improving the design of existing code through small, behaviour-preserving steps.'),
  ('Design Patterns', 'Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides', '9780201633610', 'Programming', 'Addison-Wesley', 1994, 2, 2, 'Elements of reusable object-oriented software: 23 classic design patterns.'),
  ('Effective Java', 'Joshua Bloch', NULL, 'Programming', 'Addison-Wesley', 2018, 2, 2, 'Best practices for the Java platform: object creation, generics, lambdas and concurrency.'),
  ('Head First Design Patterns', 'Eric Freeman, Elisabeth Robson', NULL, 'Programming', 'O''Reilly Media', 2020, 3, 3, 'A visual, beginner-friendly introduction to object-oriented design patterns.'),
  ('Test-Driven Development: By Example', 'Kent Beck', NULL, 'Programming', 'Addison-Wesley', 2002, 2, 2, 'Learning test-driven development by working through examples, red-green-refactor.'),
  ('Working Effectively with Legacy Code', 'Michael Feathers', NULL, 'Programming', 'Prentice Hall', 2004, 1, 1, 'Techniques to get legacy code under test and change it safely.'),
  ('Eloquent JavaScript', 'Marijn Haverbeke', NULL, 'Programming', 'No Starch Press', 2018, 3, 3, 'A modern introduction to programming with JavaScript, for beginners.'),
  ('Programming TypeScript', 'Boris Cherny', NULL, 'Programming', 'O''Reilly Media', 2019, 2, 2, 'Making JavaScript applications scale with a strong type system.'),
  ('Kotlin in Action', 'Dmitry Jemerov, Svetlana Isakova', NULL, 'Programming', 'Manning', 2017, 1, 1, 'Kotlin for Java developers: syntax, functional style, DSLs and interoperability.'),

  ('Deep Learning', 'Ian Goodfellow, Yoshua Bengio, Aaron Courville', NULL, 'Data & AI', 'MIT Press', 2016, 2, 2, 'The mathematical and conceptual background of deep neural networks.'),
  ('Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow', 'Aurélien Géron', NULL, 'Data & AI', 'O''Reilly Media', 2022, 3, 3, 'Practical machine learning with Python, from linear models to neural networks.'),
  ('Artificial Intelligence: A Modern Approach', 'Stuart Russell, Peter Norvig', NULL, 'Data & AI', 'Pearson', 2020, 2, 2, 'Comprehensive textbook on intelligent agents, search, reasoning, learning and ethics.'),
  ('Designing Machine Learning Systems', 'Chip Huyen', NULL, 'Data & AI', 'O''Reilly Media', 2022, 2, 2, 'An iterative process for production-ready machine learning applications.'),
  ('AI Engineering', 'Chip Huyen', NULL, 'Data & AI', 'O''Reilly Media', 2025, 3, 3, 'Building applications with foundation models: evaluation, prompt engineering, RAG and agents.'),
  ('Python for Data Analysis', 'Wes McKinney', NULL, 'Data & AI', 'O''Reilly Media', 2022, 2, 2, 'Data wrangling with pandas, NumPy and Jupyter.'),
  ('Storytelling with Data', 'Cole Nussbaumer Knaflic', NULL, 'Data & AI', 'Wiley', 2015, 2, 2, 'A data visualisation guide for business professionals.'),
  ('Weapons of Math Destruction', 'Cathy O''Neil', NULL, 'Data & AI', 'Crown', 2016, 1, 1, 'How big data and opaque algorithms increase inequality and threaten democracy.'),

  ('To Kill a Mockingbird', 'Harper Lee', '9780061120084', 'Fiction', 'Harper Perennial', 1960, 3, 3, 'A child''s view of racial injustice in a small Alabama town.'),
  ('1984', 'George Orwell', '9780451524935', 'Fiction', 'Signet Classics', 1949, 4, 4, 'A dystopian novel about surveillance, propaganda and totalitarian control.'),
  ('The Hobbit', 'J.R.R. Tolkien', '9780547928227', 'Fiction', 'Houghton Mifflin Harcourt', 1937, 3, 3, 'Bilbo Baggins'' unexpected journey with dwarves and a wizard to reclaim a dragon''s treasure.'),
  ('Pride and Prejudice', 'Jane Austen', NULL, 'Fiction', 'Penguin Classics', 1813, 2, 2, 'Elizabeth Bennet and Mr Darcy navigate manners, marriage and misjudgement.'),
  ('The Great Gatsby', 'F. Scott Fitzgerald', NULL, 'Fiction', 'Scribner', 1925, 2, 2, 'Wealth, love and illusion in Jazz Age New York.'),
  ('One Hundred Years of Solitude', 'Gabriel García Márquez', NULL, 'Fiction', 'Harper Perennial', 1967, 2, 2, 'The multi-generational story of the Buendía family in the town of Macondo.'),
  ('The Alchemist', 'Paulo Coelho', NULL, 'Fiction', 'HarperOne', 1988, 3, 3, 'A shepherd boy follows his dream across the desert in search of treasure.'),
  ('Palace Walk', 'Naguib Mahfouz', NULL, 'Fiction', 'Anchor', 1956, 2, 2, 'First novel of the Cairo Trilogy: a family in Cairo during the 1919 revolution.'),
  ('The Name of the Wind', 'Patrick Rothfuss', NULL, 'Fiction', 'DAW Books', 2007, 2, 2, 'Fantasy: the legendary Kvothe tells the story of his youth.'),
  ('Project Hail Mary', 'Andy Weir', NULL, 'Fiction', 'Ballantine Books', 2021, 2, 2, 'Science fiction: a lone astronaut must save Earth with science and an unlikely friend.'),

  ('A Brief History of Time', 'Stephen Hawking', NULL, 'Science', 'Bantam', 1988, 2, 2, 'From the Big Bang to black holes: cosmology for the general reader.'),
  ('The Selfish Gene', 'Richard Dawkins', NULL, 'Science', 'Oxford University Press', 1976, 2, 2, 'A gene-centred view of evolution.'),
  ('Cosmos', 'Carl Sagan', NULL, 'Science', 'Random House', 1980, 2, 2, 'The history of science and our place in the universe.'),
  ('The Gene: An Intimate History', 'Siddhartha Mukherjee', NULL, 'Science', 'Scribner', 2016, 1, 1, 'The story of genetics from Mendel to gene editing.'),
  ('Astrophysics for People in a Hurry', 'Neil deGrasse Tyson', NULL, 'Science', 'W. W. Norton', 2017, 3, 3, 'A short, beginner-friendly tour of the universe.'),
  ('The Body: A Guide for Occupants', 'Bill Bryson', NULL, 'Science', 'Doubleday', 2019, 2, 2, 'An accessible tour of the human body and how it works.'),

  ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780062316097', 'History', 'Harper', 2015, 4, 4, 'How Homo sapiens came to dominate the planet: cognitive, agricultural and scientific revolutions.'),
  ('Guns, Germs, and Steel', 'Jared Diamond', NULL, 'History', 'W. W. Norton', 1997, 2, 2, 'Why some societies conquered others: geography, food production and disease.'),
  ('The Silk Roads', 'Peter Frankopan', NULL, 'History', 'Bloomsbury', 2015, 2, 2, 'A new history of the world centred on the trade routes between East and West.'),
  ('A History of the Arab Peoples', 'Albert Hourani', NULL, 'History', 'Faber & Faber', 1991, 1, 1, 'Thirteen centuries of Arab history, from the rise of Islam to the modern era.'),
  ('The Rise and Fall of Ancient Egypt', 'Toby Wilkinson', NULL, 'History', 'Random House', 2010, 2, 2, 'Three thousand years of pharaonic civilisation.'),
  ('SPQR: A History of Ancient Rome', 'Mary Beard', NULL, 'History', 'Liveright', 2015, 1, 1, 'Rome from its mythical founding to the third century.'),

  ('The Lean Startup', 'Eric Ries', NULL, 'Business', 'Crown Business', 2011, 3, 3, 'Build-measure-learn: validated learning and minimum viable products.'),
  ('Good to Great', 'Jim Collins', NULL, 'Business', 'HarperBusiness', 2001, 2, 2, 'Why some companies make the leap to lasting greatness.'),
  ('The Manager''s Path', 'Camille Fournier', NULL, 'Business', 'O''Reilly Media', 2017, 3, 3, 'A guide for tech leaders from tech lead to CTO: managing engineers and teams.'),
  ('An Elegant Puzzle', 'Will Larson', NULL, 'Business', 'Stripe Press', 2019, 2, 2, 'Systems of engineering management: team sizing, planning and technical debt.'),
  ('Accelerate', 'Nicole Forsgren, Jez Humble, Gene Kim', NULL, 'Business', 'IT Revolution', 2018, 2, 2, 'The science of lean software and DevOps: the four key delivery metrics.'),
  ('Inspired', 'Marty Cagan', NULL, 'Business', 'Wiley', 2017, 2, 2, 'How to create technology products customers love: product discovery and teams.'),

  ('Atomic Habits', 'James Clear', NULL, 'Self-Development', 'Avery', 2018, 4, 4, 'Tiny changes, remarkable results: building good habits and breaking bad ones.'),
  ('Deep Work', 'Cal Newport', NULL, 'Self-Development', 'Grand Central', 2016, 3, 3, 'Rules for focused success in a distracted world.'),
  ('Thinking, Fast and Slow', 'Daniel Kahneman', NULL, 'Self-Development', 'Farrar, Straus and Giroux', 2011, 2, 2, 'The two systems of thinking and the biases that shape our judgement.'),
  ('Mindset', 'Carol S. Dweck', NULL, 'Self-Development', 'Ballantine Books', 2006, 2, 2, 'The psychology of fixed and growth mindsets.'),
  ('The 7 Habits of Highly Effective People', 'Stephen R. Covey', NULL, 'Self-Development', 'Free Press', 1989, 2, 2, 'A principle-centred approach to personal and professional effectiveness.');

INSERT INTO members (full_name, email, phone, status, registered_at) VALUES
  ('Nour Hassan',       'nour.hassan@example.com',      '+20 100 000 0001', 'ACTIVE',   now() - interval '400 days'),
  ('Omar Farouk',       'omar.farouk@example.com',      '+20 100 000 0002', 'ACTIVE',   now() - interval '380 days'),
  ('Mariam Adel',       'mariam.adel@example.com',      NULL,               'ACTIVE',   now() - interval '350 days'),
  ('Youssef Kamal',     'youssef.kamal@example.com',    '+20 100 000 0004', 'ACTIVE',   now() - interval '300 days'),
  ('Salma Ibrahim',     'salma.ibrahim@example.com',    '+20 100 000 0005', 'ACTIVE',   now() - interval '280 days'),
  ('Karim Mostafa',     'karim.mostafa@example.com',    NULL,               'ACTIVE',   now() - interval '260 days'),
  ('Hana Sherif',       'hana.sherif@example.com',      '+20 100 000 0007', 'ACTIVE',   now() - interval '240 days'),
  ('Ahmed Tarek',       'ahmed.tarek@example.com',      '+20 100 000 0008', 'ACTIVE',   now() - interval '220 days'),
  ('Laila Mansour',     'laila.mansour@example.com',    NULL,               'ACTIVE',   now() - interval '200 days'),
  ('Mostafa Ezz',       'mostafa.ezz@example.com',      '+20 100 000 0010', 'ACTIVE',   now() - interval '180 days'),
  ('Dina Fathy',        'dina.fathy@example.com',       '+20 100 000 0011', 'ACTIVE',   now() - interval '160 days'),
  ('Tamer Saleh',       'tamer.saleh@example.com',      NULL,               'ACTIVE',   now() - interval '150 days'),
  ('Rana Gamal',        'rana.gamal@example.com',       '+20 100 000 0013', 'ACTIVE',   now() - interval '140 days'),
  ('Hossam Nabil',      'hossam.nabil@example.com',     '+20 100 000 0014', 'ACTIVE',   now() - interval '120 days'),
  ('Yara Samy',         'yara.samy@example.com',        NULL,               'ACTIVE',   now() - interval '110 days'),
  ('Khaled Raouf',      'khaled.raouf@example.com',     '+20 100 000 0016', 'ACTIVE',   now() - interval '100 days'),
  ('Farida Lotfy',      'farida.lotfy@example.com',     '+20 100 000 0017', 'ACTIVE',   now() - interval '90 days'),
  ('Sherif Hamdy',      'sherif.hamdy@example.com',     NULL,               'ACTIVE',   now() - interval '80 days'),
  ('Aya Mahmoud',       'aya.mahmoud@example.com',      '+20 100 000 0019', 'ACTIVE',   now() - interval '70 days'),
  ('Mahmoud Reda',      'mahmoud.reda@example.com',     '+20 100 000 0020', 'ACTIVE',   now() - interval '60 days'),
  ('Nada Wael',         'nada.wael@example.com',        NULL,               'ACTIVE',   now() - interval '45 days'),
  ('Islam Fawzy',       'islam.fawzy@example.com',      '+20 100 000 0022', 'ACTIVE',   now() - interval '30 days'),
  ('Habiba Ashraf',     'habiba.ashraf@example.com',    '+20 100 000 0023', 'ACTIVE',   now() - interval '14 days'),
  ('Ziad Morsy',        'ziad.morsy@example.com',       NULL,               'INACTIVE', now() - interval '500 days'),
  ('Mona Zaki',         'mona.zaki@example.com',        '+20 100 000 0025', 'INACTIVE', now() - interval '450 days');

-- Loans: (book title, member email, borrowed days ago, loan days, returned days ago or NULL)
INSERT INTO loans (book_id, member_id, processed_by, returned_by, borrowed_at, due_at, returned_at)
SELECT b.id, m.id, s.id,
       CASE WHEN l.returned_ago IS NULL THEN NULL ELSE s.id END,
       now() - make_interval(days => l.borrowed_ago),
       now() - make_interval(days => l.borrowed_ago) + make_interval(days => l.loan_days),
       CASE WHEN l.returned_ago IS NULL THEN NULL ELSE now() - make_interval(days => l.returned_ago) END
FROM (VALUES
  -- active, not yet due
  ('Clean Architecture',                       'nour.hassan@example.com',     3, 14, NULL::int),
  ('Designing Data-Intensive Applications',    'omar.farouk@example.com',     5, 14, NULL),
  ('Designing Data-Intensive Applications',    'karim.mostafa@example.com',   2, 14, NULL),
  ('Atomic Habits',                            'mariam.adel@example.com',     1, 14, NULL),
  ('The Alchemist',                            'hana.sherif@example.com',     6, 14, NULL),
  ('Sapiens: A Brief History of Humankind',    'youssef.kamal@example.com',   4, 14, NULL),
  ('AI Engineering',                           'ahmed.tarek@example.com',    12, 14, NULL),   -- due soon
  ('System Design Interview: An Insider''s Guide', 'laila.mansour@example.com', 13, 14, NULL), -- due tomorrow
  ('Project Hail Mary',                        'dina.fathy@example.com',      8, 14, NULL),
  ('Project Hail Mary',                        'tamer.saleh@example.com',     9, 14, NULL),    -- last copy out
  ('Kotlin in Action',                         'rana.gamal@example.com',      7, 14, NULL),    -- only copy out
  -- active, overdue
  ('1984',                                     'salma.ibrahim@example.com',  20, 14, NULL),
  ('The Manager''s Path',                      'mostafa.ezz@example.com',    25, 14, NULL),
  ('Deep Work',                                'hossam.nabil@example.com',   16, 14, NULL),
  ('Clean Code',                               'yara.samy@example.com',      30, 14, NULL),
  -- returned (history)
  ('Clean Code',                               'nour.hassan@example.com',    60, 14, 50),
  ('Refactoring',                              'omar.farouk@example.com',    55, 14, 45),
  ('The Hobbit',                               'mariam.adel@example.com',    90, 14, 80),
  ('The Hobbit',                               'khaled.raouf@example.com',   40, 14, 30),
  ('Atomic Habits',                            'farida.lotfy@example.com',   35, 14, 22),
  ('Atomic Habits',                            'aya.mahmoud@example.com',    28, 14, 15),
  ('Sapiens: A Brief History of Humankind',    'mahmoud.reda@example.com',   50, 14, 41),
  ('Domain-Driven Design',                     'sherif.hamdy@example.com',   70, 21, 52),
  ('Thinking, Fast and Slow',                  'nada.wael@example.com',      33, 14, 20),
  ('The Lean Startup',                         'islam.fawzy@example.com',    25, 14, 12),
  ('Head First Design Patterns',               'habiba.ashraf@example.com',  12, 14, 3),
  ('Pride and Prejudice',                      'ziad.morsy@example.com',    200, 14, 190),
  ('Clean Architecture',                       'karim.mostafa@example.com',  45, 14, 33)
) AS l(title, email, borrowed_ago, loan_days, returned_ago)
JOIN books b ON b.title = l.title
JOIN members m ON m.email = l.email
JOIN staff_users s ON lower(s.email) = 'layla.haddad@library.test';

-- Stock follows the open loans seeded above.
UPDATE books b
   SET available_copies = b.total_copies - o.open
  FROM (SELECT book_id, count(*)::int AS open FROM loans WHERE returned_at IS NULL GROUP BY book_id) o
 WHERE o.book_id = b.id;
