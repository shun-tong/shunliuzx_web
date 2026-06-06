create table if not exists quotes (
  id integer primary key autoincrement,
  text text not null,
  source text default '',
  tag text default '未分类',
  created_at text default current_timestamp
);

create table if not exists tasks (
  id integer primary key autoincrement,
  title text not null,
  time text default '',
  level text default '普通',
  note text default '',
  done integer default 0,
  created_at text default current_timestamp
);

create table if not exists status_log (
  id integer primary key autoincrement,
  now text not null,
  mode text default '在线',
  battery integer default 50,
  focus integer default 50,
  note text default '',
  updated_at text default current_timestamp
);
