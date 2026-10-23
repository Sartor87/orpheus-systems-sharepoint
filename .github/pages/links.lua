-- Pandoc filter for the architecture site.
--  * ```mermaid code blocks become <pre class="mermaid"> so Mermaid.js renders them in the browser.
--  * Links to a rendered page (a TOGAF phase architecture/NN-*.md or an ADR architecture/adr/NNNN-*.md,
--    except the 0000 index) point to its .html page.
--  * Every other relative link points to the file on GitHub.
-- The source file's repository-relative directory comes in as the metadata field `srcdir`,
-- the repository (owner/name) as `repo`.

local repo = ''  -- owner/name, from the metadata field `repo`
local srcdir = ''

local function normalize(path)
  local parts = {}
  for part in path:gmatch('[^/]+') do
    if part == '..' then
      if #parts > 0 then table.remove(parts) end
    elseif part ~= '.' then
      table.insert(parts, part)
    end
  end
  return table.concat(parts, '/')
end

local function escape_html(s)
  return (s:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;'))
end

local function is_page(path)
  if path:match('^architecture/%d%d%-[^/]+%.md$') then return true end
  return path:match('^architecture/adr/%d%d%d%d%-[^/]+%.md$') ~= nil and not path:match('/0000%-')
end

function Meta(meta)
  if meta.srcdir then srcdir = pandoc.utils.stringify(meta.srcdir) end
  if meta.repo then repo = pandoc.utils.stringify(meta.repo) end
end

function CodeBlock(block)
  if block.classes:includes('mermaid') then
    return pandoc.RawBlock('html', '<pre class="mermaid">' .. escape_html(block.text) .. '</pre>')
  end
end

function Link(link)
  local target = link.target
  if target:match('^%a[%w+.-]*:') or target:match('^#') or target:match('^/') then return nil end
  local path, anchor = target:match('^([^#]*)(#?.*)$')
  if path == '' then return nil end
  local resolved = normalize(srcdir .. '/' .. path)
  if is_page(resolved) then
    link.target = path:gsub('%.md$', '.html') .. anchor
  else
    link.target = 'https://github.com/' .. repo .. '/blob/main/' .. resolved .. anchor
  end
  return link
end

-- Images outside architecture/ are served from the raw file on GitHub.
function Image(img)
  local src = img.src
  if src:match('^%a[%w+.-]*:') or src:match('^/') then return nil end
  local resolved = normalize(srcdir .. '/' .. src)
  if not resolved:match('^architecture/') then
    img.src = 'https://raw.githubusercontent.com/' .. repo .. '/main/' .. resolved
    return img
  end
end

return { { Meta = Meta }, { CodeBlock = CodeBlock, Link = Link, Image = Image } }
