// A template (unlike a layout) is created fresh on every navigation, which
// lets each page ease in when you open it.
export default function AppTemplate({ children }) {
  return <div className="page-enter">{children}</div>
}
