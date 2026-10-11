// Keep release builds from opening a console alongside the desktop window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    signal_desk_lib::run()
}
