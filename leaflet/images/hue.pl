#!/usr/bin/perl

$value = 0;
$c = 1;
while ( $value < 200 ){
	$command = sprintf("convert marker-icon.png -modulate 100,100,%.2f marker-%d.png\n", $value, $c);
	`$command`;
	$c++;
	$value += 40/3;
}

exit 0;
